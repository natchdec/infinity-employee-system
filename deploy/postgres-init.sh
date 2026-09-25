#!/bin/sh
set -eu

: "${DB_APP_PASSWORD:?DB_APP_PASSWORD is required}"

psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_password="$DB_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE infinity_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'infinity_app'
) \gexec

SELECT format('ALTER ROLE infinity_app PASSWORD %L', :'app_password') \gexec

GRANT CONNECT ON DATABASE infinity_employee TO infinity_app;
GRANT USAGE ON SCHEMA public TO infinity_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO infinity_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO infinity_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO infinity_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO infinity_app;
SQL
