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
BACKUP_DIR="$(dirname "$DUMP")"
DOC_ARCHIVE="$BACKUP_DIR/documents.tar.gz"
RESTORE_DB="infinity_employee_restore_drill"
RECEIPT_DIR="$BACKUP_ROOT/restore-receipts"
DOC_RESTORE_DIR="$(mktemp -d "${TMPDIR:-/var/tmp}/infinity-employee-doc-restore.XXXXXX")"
mkdir -p "$RECEIPT_DIR"

if [[ ! -f "$DUMP" ]]; then
  echo "dump not found: $DUMP" >&2
  exit 66
fi
if [[ ! -f "$DOC_ARCHIVE" ]]; then
  echo "document archive not found: $DOC_ARCHIVE" >&2
  exit 66
fi

if [[ -f "$DUMP.sha256" ]]; then
  (cd "$BACKUP_DIR" && sha256sum -c "$(basename "$DUMP").sha256")
fi
if [[ -f "$DOC_ARCHIVE.sha256" ]]; then
  (cd "$BACKUP_DIR" && sha256sum -c "$(basename "$DOC_ARCHIVE").sha256")
fi

# Reject archive entries that could escape the isolated restore directory.
if tar -tzf "$DOC_ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "document archive contains an unsafe path" >&2
  exit 65
fi

# Restore validation is deliberately isolated: the live database and live ESXi
# document directory are never overwritten by this drill.
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.yml)

cleanup() {
  "${COMPOSE[@]}" exec -T db dropdb -U infinity_owner --if-exists "$RESTORE_DB" >/dev/null 2>&1 || true
  rm -rf "$DOC_RESTORE_DIR"
}
trap cleanup EXIT

"${COMPOSE[@]}" exec -T db pg_restore --list < "$DUMP" >/dev/null
cleanup
mkdir -p "$DOC_RESTORE_DIR"
"${COMPOSE[@]}" exec -T db createdb -U infinity_owner "$RESTORE_DB"
"${COMPOSE[@]}" exec -T db pg_restore -U infinity_owner -d "$RESTORE_DB" --no-owner < "$DUMP"

migration_count="$("${COMPOSE[@]}" exec -T db psql -U infinity_owner -d "$RESTORE_DB" -Atqc "select count(*) from schema_migrations")"
table_count="$("${COMPOSE[@]}" exec -T db psql -U infinity_owner -d "$RESTORE_DB" -Atqc "select count(*) from information_schema.tables where table_schema='public'")"

if [[ "$migration_count" -le 0 || "$table_count" -le 0 ]]; then
  echo "database restore drill validation failed" >&2
  exit 1
fi

tar -xzf "$DOC_ARCHIVE" -C "$DOC_RESTORE_DIR"
document_file_count="$(find "$DOC_RESTORE_DIR" -type f -printf '%s\n' | awk 'END { print NR + 0 }')"
document_bytes="$(find "$DOC_RESTORE_DIR" -type f -printf '%s\n' | awk '{ total += $1 } END { print total + 0 }')"
document_sha="$(sha256sum "$DOC_ARCHIVE" | awk '{print $1}')"

dump_sha="$(sha256sum "$DUMP" | awk '{print $1}')"
source_sha="$(cat .release-commit 2>/dev/null || git rev-parse HEAD 2>/dev/null || printf 'unknown')"
receipt="$RECEIPT_DIR/restore-$(date -u +%Y%m%dT%H%M%SZ).json"
printf '{"event":"restore_drill_pass","checkedAt":"%s","sourceSha":"%s","dumpSha256":"%s","migrationCount":%s,"publicTableCount":%s,"documentSha256":"%s","documentFileCount":%s,"documentBytes":%s,"databaseRestoreTarget":"isolated-disposable-database","documentRestoreTarget":"isolated-temporary-directory"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$source_sha" "$dump_sha" "$migration_count" "$table_count" "$document_sha" "$document_file_count" "$document_bytes" \
  > "$receipt"

printf '%s\n' "$receipt"
