# ESXi Docker deployment

This stack is the bounded UAT deployment target for `INFINITY-EMPLOYEE-PROD01`.

## Runtime shape

- PostgreSQL 18 runs only on the private Compose network.
- Migrations run once with a separate owner login.
- The application and worker use a distinct least-privilege database login.
- UAT document storage uses a named filesystem volume.
- The app is exposed on port 3000 for internal UAT.
- Production cutover is a separate gate and requires Entra plus S3-compatible object storage.

## Start

1. Copy `deploy/esxi.env.example` to `.env`.
2. Replace both database passwords with URL-safe random values.
3. Run `docker compose up -d --build`.
4. Confirm `/api/health` and `/api/ready` return HTTP 200.
5. Reboot the VM and confirm the Compose services recover automatically.

Do not treat this UAT stack as production cutover.
