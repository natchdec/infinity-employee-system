#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <postgres.dump>" >&2
  exit 64
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/infinity-employee}"
DUMP="$(realpath "$1")"
RESTORE_DB="infinity_employee_restore_drill"
RECEIPT_DIR="$BACKUP_ROOT/restore-receipts"
mkdir -p "$RECEIPT_DIR"

if [[ ! -f "$DUMP" ]]; then
  echo "dump not found: $DUMP" >&2
  exit 66
fi

if [[ -f "$DUMP.sha256" ]]; then
  (cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256")
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.production.yml)

cleanup() {
  "${COMPOSE[@]}" exec -T db dropdb -U infinity_owner --if-exists "$RESTORE_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${COMPOSE[@]}" exec -T db pg_restore --list < "$DUMP" >/dev/null
cleanup
"${COMPOSE[@]}" exec -T db createdb -U infinity_owner "$RESTORE_DB"
"${COMPOSE[@]}" exec -T db pg_restore -U infinity_owner -d "$RESTORE_DB" --no-owner < "$DUMP"

migration_count="$("${COMPOSE[@]}" exec -T db psql -U infinity_owner -d "$RESTORE_DB" -Atqc "select count(*) from schema_migrations")"
table_count="$("${COMPOSE[@]}" exec -T db psql -U infinity_owner -d "$RESTORE_DB" -Atqc "select count(*) from information_schema.tables where table_schema='public'")"

if [[ "$migration_count" -le 0 || "$table_count" -le 0 ]]; then
  echo "restore drill validation failed" >&2
  exit 1
fi

dump_sha="$(sha256sum "$DUMP" | awk '{print $1}')"
source_sha="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
receipt="$RECEIPT_DIR/restore-$(date -u +%Y%m%dT%H%M%SZ).json"
printf '{"event":"restore_drill_pass","checkedAt":"%s","sourceSha":"%s","dumpSha256":"%s","migrationCount":%s,"publicTableCount":%s,"target":"isolated-disposable-database"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$source_sha" "$dump_sha" "$migration_count" "$table_count" \
  > "$receipt"

printf '%s\n' "$receipt"
