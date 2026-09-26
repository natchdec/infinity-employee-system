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
- Backup and restore scripts pass bash syntax checks (tasks 30846126-2ecf-4c6f-967a-3068517b3321 and d61ac2bc-6d87-4b77-86db-90d42e28b38a) and are executable.
- Microsoft Graph live read shows current app registration "Infinity Employee System UAT" exists; no production-named Employee System application was present in the 22-application inventory read on this run. Graph connection is read-only, so production identity creation remains external/authorization work.
- ESXi live UAT cannot yet be refreshed from this run: direct SSH connect task 75b280b1-f1ed-4f06-aa8d-3a2fcfdda530 did not establish a session and was canceled; ssh.status returned no sessions. Do not blind-retry credentials. Existing prior ESXi UAT evidence remains valid only for the prior source/runtime, not these new production assets.
- Source sync remains externally blocked: Infinity-GitHub is configured but unauthenticated; the expected AGW OCI GitHub header credential file is absent. Do not blind-retry push until authorization is restored.
- Production external inputs still required for final live acceptance: production Entra app/certificate + final HTTPS callback, private S3-compatible bucket and runtime credential file, approved hostname/DNS/TLS ingress, Google Routes production credential and retention approval for durable evidence, restore drill on production config, and explicit cutover approval.
- Next sanctioned action: commit this verified local milestone, push after GitHub auth is restored, then transfer/deploy the exact commit to ESXi via the authorized shared connection and execute Compose/TLS/backup/restore/live-route UAT.
<!-- agent-gateway:managed:end:autocontinue-2026-09-26-run2 -->
