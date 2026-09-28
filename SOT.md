# Source of Truth

## Verified Business Rules
- Company size: 11 employees, one legal entity.
- Employment type: permanent monthly employees only.
- Payroll date: 25th monthly.
- Payroll cutoff: approved before the 24th; late approval moves to next cycle.
- Working schedule: Mon-Fri 09:00-18:00, lunch 12:00-13:00.
- Leave unit: full day only.
- Leave baseline: Thai labor-law defaults with configurable company overrides.
- OT: employee enters whole hours by OT multiplier/category and task/project; no start/end time and no minute precision.
- OT approval: line Head only. No Project Manager approval.
- Heads are company owners and never self-approve Leave, OT, Expense, Travel, or Entertainment.
- OT is paid with payroll.
- Travel/transport/expense reimbursements are paid separately via petty cash / transfer.
- Private-car mileage rate: 8 THB/km.
- Mileage deduction: subtract normal Home-to-Office distance per eligible trip leg.
- Route source target: Google Maps.
- Toll/Parking: reimbursable with receipt.
- Taxi: meter photo/evidence.
- Grab: receipt.
- Entertainment is an Expense subtype; primarily used by Sales.
- Domestic and international per diem rates are configurable.
- International rate: one rate for all countries in V1.
- Current foreign travel use case: Laos, paid in THB.
- Hotel and rental car require receipt/evidence.
- Project travel may request Cash Advance.
- Cash Advance settlement deadline: within 3 days after trip end.
- Digital receipt may be used for payment; original receipt can arrive later.
- Finance Head cannot verify or mark paid their own claim; another Finance/Admin user must do so.
- Accounting: Smartbiz.
- Payroll: Easy-ACC; salary payment uses KBank bulk workflow.
- Project Master target: Microsoft Lists/SharePoint surfaced in Microsoft Teams.
- Primary interface: mobile-first web/PWA.
- LINE OA is deferred to a later convenience phase.

## Technical Baseline
- Docker-first.
- Docker Compose.
- Modular monolith.
- PostgreSQL primary transactional database.
- Object storage for receipt/document binaries.
- Microsoft Entra ID for authentication.
- Infinity ESXi is the target initial production hosting environment. Run Docker Compose inside a dedicated Linux VM on ESXi; do not run the Employee System application on Agent Gateway OCI.

## Verified Implementation State
- Active branch: feat/v1-implementation.
- M0 foundation and M1/M2 transaction engine are already committed and synchronized to origin.
- Next.js App Router, Entra OIDC boundary, role-aware server pages, PostgreSQL access, structured logging, health/readiness routes, and PostgreSQL-backed worker exist.
- Isolated OCI UAT uses PostgreSQL 18.4 over a private Unix-domain socket with no TCP listener.
- Database migrations: 5 total. Migration 005 (`identity_bootstrap`) was applied on the isolated PostgreSQL 18.4 UAT with checksum verification; the post-migration transaction UAT passed.
- Synthetic UAT seed contains 6 non-production identities and 8 policy families; real employee data is not seeded.
- Source verification passes the full `pnpm verify` gate: format, lint with zero warnings, typecheck, 46/46 tests, and Next production build.
- Request workflows implement submit/resubmit/cancel, Head approve/return/reject, Owner/Head system-skip, Finance verify/return, optimistic revision fencing, idempotency receipts, immutable approval history, and Finance conflict-of-interest enforcement.
- Leave, OT, Expense, Mileage, Entertainment, Trip, Per Diem, Cash Advance and settlement calculations/persistence are policy-versioned and transactional.
- OT approval allocates to the centralized payroll-cycle cutoff logic; late approval moves to the next eligible cycle.
- Document storage abstraction supports private filesystem in non-production and S3-compatible object storage in production; production refuses filesystem document storage.
- UAT image evidence accepts JPEG/PNG/WebP after magic/decode checks; PDF intake is fail-closed until malware scanning is configured.
- Finance implements original-receipt tracking, independent verification, payable obligations, petty-cash/transfer payment batches, idempotent payment completion and immutable paid-state guards.
- Trip-linked Expense does not create a standalone payable; it is reconciled through Trip settlement to prevent duplicate payment.
- Finance/Travel UAT passes standalone payment, original-receipt independence, document authorization/idempotency, PDF fail-closed, 20,000 THB advance versus 17,600 THB actual refund, 20,000 THB advance versus 22,000 THB actual top-up, payment idempotency, payroll review export and accounting review export.
- Easy-ACC and Smartbiz adapter requests are fail-closed because exact supported import/API formats have not yet been verified; neutral review CSV exports are available for verification.
- Implemented-app Browser UAT passes Chromium 153 with 52 captures across 390/820/1440 widths, zero page errors, zero blocking Axe WCAG findings, no document-level horizontal overflow and no Lorem Ipsum.
- Representative Sign-in, Employee Home/Expense, Head Approval and Finance Queue/Payment screenshots passed Astra workflow review plus the design-taste-frontend anti-AI-slop visual guardrail.
- PWA UAT passes installable manifest, active service worker, offline fallback and reconnect. Service-worker cache is restricted to `/offline`, `/icon-192.png`, and `/icon-512.png`; employee, Finance, API, and authenticated page data are not cached.
- Health and readiness return HTTP 200 on the current isolated UAT stack.
- UAT process evidence shows supervisor timeout/stop behavior can leave an idle PostgreSQL client session during smart shutdown; UAT recovery is bounded to the isolated database and does not change product persistence semantics.
- Docker CLI/socket is not exposed inside the OCI worker. This is expected because production Docker Compose verification now belongs on the dedicated Linux VM hosted by Infinity ESXi, not on Agent Gateway OCI.
- Live Infinity ESXi UAT passed on `INFINITY-EMPLOYEE-PROD01` at `172.20.11.220` with 2 vCPU, 4 GB RAM and a 60 GB thin VMDK on the NFS datastore.
- The ESXi VM runs Docker 29.1.3 and Docker Compose 2.40.3. The production-image build passed Next.js compilation, TypeScript validation and static generation before the runtime stack was started.
- PostgreSQL 18 uses the version-compatible `/var/lib/postgresql` volume layout. Database, migration and worker traffic stay on the internal backend network; the app additionally joins a frontend bridge and publishes `0.0.0.0:3000`.
- Live ESXi runtime acceptance passes: database healthy, migration exit 0, app healthy, worker running, `/api/health` HTTP 200 and `/api/ready` HTTP 200 from both the VM and the Infinity VPN worker.
- Reboot persistence passed with a changed VM boot ID; Docker returned enabled/active and db/app/worker recovered automatically with health/readiness still green.
- Backup verification passed with a PostgreSQL dump and document-volume archive under `/var/backups/infinity-employee`; both archives validated successfully after reboot.
- The current ESXi deployment remains UAT: production-grade secret rotation, Entra production identity, S3-compatible object storage, domain/TLS and explicit cutover approval remain required before serving live users.

## External Readiness Gates
- Production Entra tenant/client credentials and redirect registration.
- Production S3-compatible object storage credentials. OCI Object Storage remains a compatible option even though the application host is on Infinity ESXi.
- Microsoft Lists/SharePoint Project Master production source connection and field mapping.
- Google Routes credential/provider verification for automated route quotes.
- Verified Easy-ACC supported import/API format.
- Verified Smartbiz supported import/API format.
- Explicit authorization before production cutover affecting live users.

<!-- agent-gateway:managed:start:external-readiness-2026-09-26 -->
## External readiness verification — 2026-09-26
- Project Master live SharePoint snapshot contains 458 projects. Customer, Sales Owner and Status are populated 458/458; Start Date and End Date are populated 405/458; Engineer Lead and Cost Center are populated 0/458. Do not invent these two required semantics; production mapping remains blocked until an authoritative source/list/field is identified or scope explicitly changes.
- Google Routes now has a separate transient preview boundary at `/api/routes/preview`: it requires only the API key, returns `Cache-Control: no-store`, never writes `route_quotes`, and explicitly marks the result non-persistable/non-evidence. The durable `/api/routes/quote` path remains fail-closed unless contractual retention rights are explicitly confirmed. This avoids treating preview distance/duration as permanent Google-verified financial evidence.
- Easy-ACC PRIMPORT employee-code width is verified at <=9 digits with regression coverage; production enablement still requires authoritative employee-code, workday and OT1–OT4 mappings from the payroll owner/system.
- Smartbiz exact transaction import/API contract remains unverified and therefore fail-closed.
- Live ESXi UAT, reboot persistence and backup archive validation remain previously verified. Production cutover still requires production object storage, domain/TLS, production credentials, restore acceptance and explicit cutover approval.
- Earlier Agent Gateway git commit/push operations remained non-terminal and are preserved as ambiguous receipts. Current source state has since been re-verified through the project control plane and AGW OCI git CLI; only a new receipt-backed commit/push attempt may replace those stale operations.
- Full source verification on 2026-09-26 passed `pnpm verify` after the Routes preview redesign and integration cleanup: Prettier, ESLint with zero warnings, TypeScript, 46/46 tests and Next production build all green.
- Migration 005 applied successfully to isolated PostgreSQL 18.4 UAT (`total=5`, checksum verified); synthetic seed remained 6 employees / 8 policy families and the full transaction UAT passed after the migration.
<!-- agent-gateway:managed:end:external-readiness-2026-09-26 -->

<!-- agent-gateway:managed:start:autocontinue-2026-09-26-run -->
Run checkpoint 2026-09-26:
- Verified local HEAD 0075d395e1f60042de3cbc08ddc6ce0077f01154 on feat/v1-implementation. Commit message: "feat: advance production integration readiness". Working tree after commit has only untracked .transfer-runtime/; do not commit it.
- Full source gate PASS via task 3a08c828-1235-403e-96ba-471ace636d67: Prettier, ESLint --max-warnings 0, TypeScript, 46/46 tests, Next production build.
- Google Routes now exposes /api/routes/preview as transient Cache-Control:no-store, non-persistable/non-evidence preview. Durable /api/routes/quote remains fail-closed unless GOOGLE_ROUTES_RETENTION_CONFIRMED=true with separately confirmed retention rights.
- Migration 005_identity_bootstrap.sql applied successfully to isolated PostgreSQL 18.4 UAT with checksum verification (task e7d35237-29ea-41ff-a53e-2f1c74927047); synthetic seed PASS; post-migration transaction UAT PASS (task 77ee4891-6ede-49f5-a802-dc2f097f2878).
- Project Master authoritative live snapshot remains 458 rows: Customer/Sales Owner/Status 458/458, Start/End 405/458, Engineer Lead 0/458, Cost Center 0/458. Do not invent the two missing semantics.
- Source-control push is externally blocked by GitHub auth. One receipt-backed HTTPS push attempt (task 56ec231f-bad5-4be8-aec8-5f4b6bfc0225) failed code 128: "could not read Username for https://github.com". A read-only SSH ls-remote probe (task 918f1d4c-8f97-424f-983e-76b7061346fa) also failed: repository not found/access denied. Do not blind-retry. Restore repo access/credential, then push feat/v1-implementation and verify upstream ahead=0.
- Existing ESXi UAT/reboot/backup archive evidence remains valid for the previously deployed build. Latest local commit is not yet deployed because source sync/auth and a live ESXi connection are unavailable in this run.
- Remaining true external gates: authoritative Engineer Lead + Cost Center source; Google Routes API credential and retention rights only if durable Google evidence is required; Easy-ACC employee/workday/OT1-OT4 mappings; sanctioned Smartbiz transaction contract; production Entra identity; S3-compatible private object storage credentials/bucket; public domain/TLS; restore acceptance on production config; explicit cutover approval.
Next run: resume from this checkpoint, fix/reauthorize GitHub without exposing tokens, push 0075d395..., then continue production infrastructure and latest-commit ESXi UAT.
<!-- agent-gateway:managed:end:autocontinue-2026-09-26-run -->

<!-- agent-gateway:managed:start:github-mcp-oci -->
2026-09-26: Configured AGW OCI external MCP `Infinity-GitHub` for GitHub hosted MCP all-toolsets endpoint `https://api.githubcopilot.com/mcp/x/all`. Configuration is valid, transport preflight passes, `readOnly=false`, `writeEnabled=true`, and AGW policy reports `autoApproveMode=full-access`. Integration validation is intentionally not called ready yet because GitHub authentication/consent is missing (`AUTHENTICATION_FAILED`); do not recreate or duplicate the server. Complete GitHub OAuth/PAT authorization, then validate tool discovery + bounded read + write probe before using it for source-control sync.
<!-- agent-gateway:managed:end:github-mcp-oci -->

<!-- agent-gateway:managed:start:autocontinue-2026-09-26-run2 -->
Run checkpoint 2026-09-26 continuation:
- User decision: Project Master does not exist yet and is deferred for this cut. Easy-ACC and Smartbiz are also deferred. They remain visible and fail-closed, but are non-blocking production readiness gates.
- Production preflight now distinguishes blocking vs deferred gates and supports Entra certificate-mode readiness. Blocking gates include HTTPS origin, Entra identity, private S3-compatible storage, Google Routes credential/retention, receipt-backed restore acceptance, and explicit cutover approval.
- Production deployment hardening added: runtime image executes as non-root UID/GID 10001; production Compose overlay; Caddy TLS reverse-proxy template; runtime S3 credentials file mount; Google Routes runtime env-file path; production environment template; database backup script; isolated disposable-database restore drill with receipt.
- Verification receipt: Agent Gateway OCI task 2fcefa3d-33f0-4ddb-8b35-55a1f5002cf2 completed code 0. pnpm verify PASS: formatting, ESLint, TypeScript, 50/50 tests, Next.js 16.3.6 production build.
- Backup and restore scripts pass bash syntax checks and are executable.
- Microsoft Graph live read shows current app registration "Infinity Employee System UAT" exists; no production-named Employee System application was present in the 22-application inventory read on this run. Graph connection is read-only, so production identity creation remains external/authorization work.
- ESXi live UAT could not be refreshed in that run because the direct SSH path did not establish. Existing prior ESXi evidence remained valid only for the prior source/runtime.
- Source sync remained blocked because the existing GitHub connection was not usable; do not blind-retry prior failed push paths.
- Production external inputs still required for final live acceptance: production identity, private S3-compatible storage, approved HTTPS ingress, Google Routes production input, restore acceptance, and explicit cutover approval.
Next sanctioned action: deploy the next verified exact commit through the authorized shared ESXi path and continue production-provider/live UAT.
<!-- agent-gateway:managed:end:autocontinue-2026-09-26-run2 -->

<!-- agent-gateway:managed:start:autocontinue-2026-09-26-run3 -->
Run checkpoint 2026-09-26:
- Exact Work Session remains ws_fcd73c6e4eb54b8fb3563806a7fbca6a; no replacement identity was created.
- Cloudflare Access SSO source milestone is commit 937ec64fc613992e1e7ef4aa26231749a5392c70.
- Verification process 0385d55e-f31a-40ba-919f-9baf30ab22d9 exited 0: formatting, lint, typecheck, 53/53 tests, and Next.js production build passed.
- Reuse the existing healthy Cloudflare tunnel agent-gateway-oci-admin, id 686c8778-7524-4e12-b343-b2d071e21f94; do not create a duplicate.
- Intended hostname is employee.infinitysolutions.co.th. Live Access application AUD is not yet recorded in runtime config.
- Main OCI worker cannot directly reach 172.20.11.220:3000; task f3a9dfed-06bc-4c87-a5e5-c142e8d2b2a2 timed out. Use the dedicated Infinity VPN execution plane instead.
- Shared ESXi path is live: task 7bb52dd9-df6d-4123-8f11-337bcb5af92f connected, and task 34a06aff-b068-49a4-ad89-9e79af8d3a32 confirms INFINITY-EMPLOYEE-PROD01 powered on with VMware Tools and IP 172.20.11.220.
- Do not publish the Employee hostname until commit 937ec64 is deployed and the origin is verified through the sanctioned VPN path.
- Source sync still awaits the existing GitHub connection to become usable; do not blind-retry prior failed push paths.
- Project Master, Easy-ACC, and Smartbiz remain deferred/non-blocking. Remaining blocking gates include private object storage, Google Routes production input, Cloudflare Access app/AUD and route, production restore acceptance, and explicit cutover approval.
Next sanctioned action: deploy 937ec64 through the existing Infinity VPN/shared ESXi path, verify health/readiness, then publish employee.infinitysolutions.co.th on the existing tunnel, attach Access using the existing Microsoft identity provider, record AUD, and run HTTPS/SSO live UAT.
<!-- agent-gateway:managed:end:autocontinue-2026-09-26-run3 -->

<!-- agent-gateway:managed:start:autocontinue-run3 -->
Run checkpoint 2026-09-26:
- Exact Work Session: ws_fcd73c6e4eb54b8fb3563806a7fbca6a; no replacement session/project/workspace created.
- Source milestone: 937ec64fc613992e1e7ef4aa26231749a5392c70 adds Cloudflare Access SSO. Full verification passed: 53/53 tests plus Next.js production build.
- Existing healthy Cloudflare tunnel agent-gateway-oci-admin must be reused; intended hostname is employee.infinitysolutions.co.th. Access application AUD is not yet in runtime config.
- Main OCI worker cannot reach 172.20.11.220:3000 directly. The shared Infinity execution plane is live; ESXi is connected and INFINITY-EMPLOYEE-PROD01 is powered on with VMware Tools at 172.20.11.220.
- Do not publish the Employee hostname until exact commit 937ec64 is deployed and origin health/readiness is verified through the dedicated Infinity path.
- Source sync still awaits the existing GitHub connection. Project Master, Easy-ACC and Smartbiz remain deferred/non-blocking.
- Remaining blocking gates: private object storage, Google Routes production input, Cloudflare Access app/AUD + route, production restore acceptance, explicit cutover approval.
Next: deploy 937ec64 through the existing shared ESXi path, verify origin, then finish Access + hostname route and HTTPS/SSO live UAT.
<!-- agent-gateway:managed:end:autocontinue-run3 -->

<!-- agent-gateway:managed:start:cloudflare-mcp-oci-2026-09-26 -->
2026-09-26: Preserve the existing Cloudflare provider entry on AGW OCI; do not create a duplicate. Its configuration and transport setup are present, while live provider validation remains incomplete. Continue the existing entry and validate it before using it for production provider changes.
<!-- agent-gateway:managed:end:cloudflare-mcp-oci-2026-09-26 -->

<!-- agent-gateway:managed:start:cloudflare-access-provider-state -->
Provider verification 2026-09-26:
- The Access application list currently has only the existing admin application; the Employee System application is not present.
- The identity-provider list currently has only the default provider; the Microsoft provider required by the target design is not present.
- The admin browser is not signed in to the Microsoft admin portal, so the provider-side setup cannot be completed in this non-interactive run.
- Source code is ready for the external Access assertion to map an active employee and issue the normal application session.
<!-- agent-gateway:managed:end:cloudflare-access-provider-state -->

<!-- agent-gateway:managed:start:employee-cloudflare-topology-20260927 -->
## Employee System Cloudflare topology correction — 2026-09-27
- Authoritative topology: `agw-admin.infinitysolutions.co.th` is served by the existing `agent-gateway-oci-admin` tunnel on AGW OCI. The Employee System is a separate runtime on `INFINITY-EMPLOYEE-PROD01` (Infinity ESXi, `172.20.11.220`) and MUST NOT reuse the AGW admin tunnel.
- Employee public ingress requires a separate Cloudflare Tunnel/connector colocated with the Employee VM/ESXi network. Target origin is `http://127.0.0.1:3000` on the Employee VM.
- Shared Infinity execution plane is confirmed live: workspace `customer-infinity-solutions` dispatches to worker `vpn-infinity-solutions`; Infinity-ESXi is READY/live-read-verified; VM is powered on with VMware Tools running at `172.20.11.220`.
- Direct SSH to the Employee VM using the existing deployment key and known_hosts succeeds as user `ubuntu`. Docker is active. App/db/worker containers are running; app is healthy and `http://127.0.0.1:3000/api/health` returns HTTP 200.
- `cloudflared` was installed on the Employee VM from Cloudflare's official APT repository. Verified version: `2026.9.3`. Service is intentionally inactive until the correct Infinity-account tunnel token is available.
- A mistakenly-created `infinity-employee-prod` tunnel made while treating the OCI admin tunnel as reusable was deleted before any connector was installed; do not infer that Employee ingress is complete from that stale attempt.
- Cloudflare Access app and Microsoft Entra IdP were configured earlier in the current continuation and the IdP live test passed. Public hostname live UAT is still blocked on Tunnel/DNS.
- Current Cloudflare OCI credential is NOT authorized for the Infinity Cloudflare account. Direct API account listing proves it can access only account `578dbabcdff6ab54e0b59e366bbf1b47` (Hmathh@gmail.com's Account), while the Infinity account used by the configured Access app is `9aaa7e2e9be7382908589bf3373eabd6`. Do not use the current OCI Cloudflare MCP credential for Employee production.
- AGW Local tunnel-client is currently disconnected (>300 s not seen), so the previously authenticated Infinity Cloudflare browser session is not reachable from Agent Gateway at this checkpoint.
- Next sanctioned action: restore an authorized Infinity Cloudflare session/credential, recreate dedicated tunnel `infinity-employee-prod`, obtain its token without exposing it in chat, install the connector service on `INFINITY-EMPLOYEE-PROD01`, configure `employee.infinitysolutions.co.th -> http://127.0.0.1:3000`, then run DNS/TLS/Access/Entra live UAT.
<!-- agent-gateway:managed:end:employee-cloudflare-topology-20260927 -->

<!-- agent-gateway:managed:start:phase2-2026-09-28 -->
## Phase 2 engineering checkpoint — 2026-09-28
- Current source branch is `feat/v1-implementation`.
- Microsoft directory + Outlook runtime milestone is committed and synchronized as `9b5d3e5`. Source now contains 11 ordered migrations; migration 011 adds Microsoft 365 tenant-directory synchronization without automatically granting Employee System access.
- Phase 2 source milestone is `54cc3e2`: project cost reporting/reconciliation is present; Teams Workflow notifications use validated in-app links, deduplicated reminder fan-out and retry-safe worker delivery; Finance exposes a role-gated Operational Dashboard for queues, exceptions, background jobs and worker freshness.
- Source regression is green: 83/83 tests pass. The full `pnpm verify` worker execution completed with exit code 0 after its parent dispatch crossed the AGW watchdog deadline; the worker ledger and separate regression receipt reconcile the ambiguous parent state.
- Phase 2 roadmap items are complete in source. Project Master, Easy-ACC and Smartbiz remain deferred/non-blocking by product decision.
- Production is not yet approved for live cutover. Remaining blocking gates are private S3-compatible object storage, Google Routes production credential plus contractual retention confirmation for durable evidence, production restore acceptance, dedicated Cloudflare Tunnel/Access hostname+AUD live UAT, and explicit cutover approval.
<!-- agent-gateway:managed:end:phase2-2026-09-28 -->
