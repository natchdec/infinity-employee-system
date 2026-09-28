#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/infinity-employee}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="$BACKUP_ROOT/$STAMP"
DUMP="$OUT_DIR/postgres.dump"

mkdir -p "$OUT_DIR"

# Database backup must not depend on app/worker provider configuration.
# docker-compose.production.yml only overrides app/worker, so the base
# Compose definition is authoritative for the unchanged db service.
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.yml)

"${COMPOSE[@]}" exec -T db pg_isready -U infinity_owner -d infinity_employee >/dev/null
"${COMPOSE[@]}" exec -T db pg_dump -U infinity_owner -d infinity_employee -Fc > "$DUMP"
pg_dump_sha="$(sha256sum "$DUMP" | awk '{print $1}')"
printf '%s  %s\n' "$pg_dump_sha" "$(basename "$DUMP")" > "$DUMP.sha256"

source_sha="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
printf '{"event":"backup_complete","createdAt":"%s","sourceSha":"%s","databaseDump":"%s","sha256":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$source_sha" "$DUMP" "$pg_dump_sha" \
  > "$OUT_DIR/manifest.json"

printf '%s\n' "$DUMP"
