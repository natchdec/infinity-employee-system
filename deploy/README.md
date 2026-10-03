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
2. Configure the dedicated Cloudflare Access application for `employee.infinitysolutions.co.th` with the approved Microsoft Entra identity provider and record its Access audience in the runtime env.
3. Install the approved read-only Microsoft Graph certificate identity on the VM and use the same identity for Directory sync, Outlook Calendar sync and Project Master. Do not create a writable Project Master identity.
4. Provision the private ESXi-local document directory (default `/srv/infinity-employee/documents`) with access limited to the deployment operator and application container. S3/object storage is not used for this production cut.
5. Place the Google Routes credential in the runtime-only env file. Keep durable Google-derived evidence fail-closed unless contractual retention rights have been confirmed.
6. Run a dedicated `infinity-employee-prod` Cloudflare Tunnel connector on this VM/network and route `employee.infinitysolutions.co.th` to `http://127.0.0.1:3000`. Do not reuse the Agent Gateway admin tunnel.
7. Run `docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml config` and review the rendered configuration for secret leakage before deployment.
8. Run `docker compose --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml up -d --build`.
9. Confirm local `/api/health` and `/api/ready`, then confirm HTTPS + Cloudflare Access/Entra and run the regression/UAT suite against the production candidate.
10. Run `deploy/backup.sh`, then `deploy/restore-drill.sh <dump-file>`. The drill restores the database into an isolated disposable database and the companion `documents.tar.gz` into an isolated temporary directory; it never overwrites live database or document storage.
11. Set `PRODUCTION_RESTORE_ACCEPTED=true` only after reviewing the database + document restore receipt. Set `PRODUCTION_CUTOVER_APPROVED=true` only after the explicit business/operations cutover decision.

`deploy/Caddyfile` remains available for bounded direct/UAT TLS tests, but the accepted production ingress is the dedicated Cloudflare Tunnel/Access path above.

Project Master is an active production gate. Configure the authoritative Microsoft Lists / SharePoint tenant, site, list, verified column mapping and approved shared read-only Microsoft Graph application before cutover; Employee System remains a read-only projection and never creates or edits the source master. Missing optional Engineer Lead or Cost Center source fields remain visibly unavailable rather than invented. Easy-ACC and Smartbiz remain deferred/non-blocking. Google Routes remains fail-closed for durable provider evidence until both a production API credential and contractual retention approval are present.
