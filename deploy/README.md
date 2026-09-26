# ESXi Docker deployment

The base stack is the bounded UAT deployment target for `INFINITY-EMPLOYEE-PROD01`.
Production uses the same application image plus `docker-compose.production.yml`; production is never inferred from a successful UAT.

## UAT runtime shape

- PostgreSQL 18 runs only on the private Compose network.
- Migrations run once with a separate owner login.
- The application and worker use a distinct least-privilege database login.
- UAT document storage uses a named filesystem volume.
- The app is exposed only on the configured bind address/port.
- Real Entra certificate paths are passed from the host; the UAT defaults remain snake-oil paths only for bounded test use.

## UAT start

1. Copy `deploy/esxi.env.example` to `.env`.
2. Replace both database passwords with URL-safe random values.
3. Run `docker compose up -d --build`.
4. Confirm `/api/health` and `/api/ready` return HTTP 200.
5. Reboot the VM and confirm the Compose services recover automatically.

## Production candidate

1. Copy `deploy/production.env.example` to `.env.production` and chmod it to 0600.
2. Provision a dedicated Entra application/certificate and register the final HTTPS callback.
3. Provision a private S3-compatible bucket and runtime credentials. Keep public access disabled.
4. Point the approved hostname at the ESXi ingress path and ensure TCP 80/443 can reach the reverse proxy, or replace the proxy/TLS section with the approved corporate ingress.
5. Keep `APP_BIND_IP=127.0.0.1`; only the reverse proxy should publish the application.
6. Run `docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml config` and review the rendered configuration for secret leakage before deployment.
7. Run `docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml up -d --build`.
8. Confirm HTTPS `/api/health` and `/api/ready`, then run the regression/UAT suite against the production candidate.
9. Run `deploy/backup.sh`, then `deploy/restore-drill.sh <dump-file>`. The drill always restores into an isolated disposable database and never overwrites the live database.
10. Set `PRODUCTION_RESTORE_ACCEPTED=true` only after reviewing the restore receipt. Set `PRODUCTION_CUTOVER_APPROVED=true` only after the explicit business/operations cutover decision.

`deploy/Caddyfile` is a default TLS reverse-proxy template. Automatic public certificate issuance requires the approved DNS name and reachable ACME path; otherwise use the organization's approved TLS ingress and do not claim the domain/TLS gate complete.

Project Master, Easy-ACC and Smartbiz are deferred for the current cut and remain visible as non-blocking/deferred gates. Google Routes remains fail-closed for durable provider evidence until both a production API credential and contractual retention approval are present.
