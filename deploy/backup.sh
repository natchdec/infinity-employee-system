#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/infinity-employee}"
DOCUMENTS_HOST_PATH="${DOCUMENTS_HOST_PATH:-/srv/infinity-employee/documents}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="$BACKUP_ROOT/$STAMP"
DUMP="$OUT_DIR/postgres.dump"
DOC_ARCHIVE="$OUT_DIR/documents.tar.gz"

sudo -n install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$OUT_DIR"

if [[ ! -d "$DOCUMENTS_HOST_PATH" ]]; then
  echo "document storage not found: $DOCUMENTS_HOST_PATH" >&2
  exit 66
fi

# Database backup uses the unchanged private db service.
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.yml)

"${COMPOSE[@]}" exec -T db pg_isready -U infinity_owner -d infinity_employee >/dev/null
"${COMPOSE[@]}" exec -T db pg_dump -U infinity_owner -d infinity_employee -Fc > "$DUMP"
pg_dump_sha="$(sha256sum "$DUMP" | awk '{print $1}')"
printf '%s  %s\n' "$pg_dump_sha" "$(basename "$DUMP")" > "$DUMP.sha256"

# Documents remain private on the ESXi VM. Read the protected host directory
# through sudo, but create the archive and receipt as the deployment operator.
sudo -n tar -C "$DOCUMENTS_HOST_PATH" -cf - . | gzip -9 > "$DOC_ARCHIVE"
tar -tzf "$DOC_ARCHIVE" >/dev/null
doc_sha="$(sha256sum "$DOC_ARCHIVE" | awk '{print $1}')"
printf '%s  %s\n' "$doc_sha" "$(basename "$DOC_ARCHIVE")" > "$DOC_ARCHIVE.sha256"
doc_count="$(sudo -n find "$DOCUMENTS_HOST_PATH" -type f -printf '%s\n' | awk 'END { print NR + 0 }')"
doc_bytes="$(sudo -n find "$DOCUMENTS_HOST_PATH" -type f -printf '%s\n' | awk '{ total += $1 } END { print total + 0 }')"

source_sha="$(cat .release-commit 2>/dev/null || git rev-parse HEAD 2>/dev/null || printf 'unknown')"
printf '{"event":"backup_complete","createdAt":"%s","sourceSha":"%s","databaseDump":"%s","databaseSha256":"%s","documentArchive":"%s","documentSha256":"%s","documentFileCount":%s,"documentBytes":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$source_sha" "$DUMP" "$pg_dump_sha" "$DOC_ARCHIVE" "$doc_sha" "$doc_count" "$doc_bytes" \
  > "$OUT_DIR/manifest.json"

printf '%s\n' "$DUMP"
