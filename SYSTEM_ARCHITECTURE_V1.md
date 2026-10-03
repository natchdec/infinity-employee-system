# System Architecture V1

Decision date: 2026-09-23. Scope: one legal entity, approximately 11 permanent employees. Target identity, project path and repository remain unchanged. This is the architectural contract; completion of a document is not deployment acceptance.

## Context and topology

Employee/Head mobile and Finance/Admin desktop use one responsive Next.js/React TypeScript application. Microsoft Entra is the identity provider. PostgreSQL is the transactional source of truth. Receipts live in private object storage, not database blobs. Microsoft Lists/SharePoint remains the project master. Easy-ACC, Smartbiz and Google Routes are external adapter boundaries, never invented integrations.

Deployment is a modular monolith built into one application image, run as two process roles: employee-app and employee-worker. Production Docker Compose runs inside a dedicated Linux VM hosted on Infinity ESXi and also runs PostgreSQL and a reverse proxy. App and worker share domain modules, migrations, configuration validation and database schema; they are not independent microservices. No Redis, Kubernetes or message broker is necessary. A small PostgreSQL job/outbox table provides durable work.

Client access -> TLS reverse proxy on the Infinity ESXi Linux VM -> employee-app -> PostgreSQL/private storage. Worker -> PostgreSQL jobs -> approved storage/read-only integrations. Entra redirects terminate at the app's fixed callback. PostgreSQL has no public port. Development/UAT binds loopback; production publication requires a reviewed hostname/TLS and explicit cutover approval. Infinity Employee services, volumes, networks and ports on ESXi must be separate from Agent Gateway. Agent Gateway OCI and its VPN containers are a separate automation/connectivity plane, not the Employee System application host. Never mount the Docker socket into the application.

## Module boundaries

- Identity/organization: tenant-bound Entra mapping, employees, departments, dated reporting lines, roles and wage/OT eligibility history.
- Policy/calendar: immutable published versions, effective dates, statutory floor validation, full-day calendars, payroll cutoff and transaction snapshots.
- Requests/approvals: draft/revision/submission lifecycle, line-Head assignment snapshot, owner system skip, immutable approval actions, return/correction and authorization.
- Leave: entitlement versus paid entitlement, workday/calendar counting, overlap protection and auditable balance reservations/reversals.
- OT/payroll: integer category hours, effective wage basis, policy calculation, assigned payroll cycle and frozen exports.
- Expenses/documents/mileage: line categories, Entertainment details, evidence, independent original status, per-leg mileage snapshots and private receipt access.
- Travel: Trip parent, approved actuals, per diem, paid advances, three-day settlement and net refund/top-up.
- Finance: independent verification, conflict of interest, payable obligations, payment batches and payment recording.
- Integrations/reporting: read-only project projection, route provider, vendor adapter contracts, neutral review exports and project-cost reconciliation.
- Audit/jobs/notifications: append-only events, transactional outbox, durable retries, in-app notifications and worker heartbeat.

Domain functions accept explicit actor/time/policy inputs and are tested independently of HTTP. HTTP handlers validate with Zod, resolve the server session, enforce object-level authorization and call transactional services. Browser previews are advisory; submitted money, policy and authorization claims are never trusted. Postgres.js tagged, parameterized SQL is the primary query layer; SQL migrations remain authoritative and reviewable. Avoid an unnecessary second persistence abstraction.

## Identity, sessions and authorization

Use tenant-specific OIDC discovery with authorization code + PKCE, state and nonce through maintained openid-client. Validate issuer, audience, tenant and object ID. Map (tenant ID, Entra object ID) to an active employee; email is display/contact information, not the sole identity key. No local password database, unrestricted domain auto-enrollment or production impersonation endpoint.

Store login-flow state/PKCE/nonce server-side with a short TTL. Session cookies are opaque random values, HttpOnly, SameSite=Lax, host-only and Secure in production; only a hash is stored in the database. Sessions expire and can be revoked. Resolve current active status/roles server-side on each request. Mutating browser requests require the configured same Origin and a session-bound CSRF token. No token or authorization header is logged. Private responses are no-store. Production environment validation rejects unsafe origins and incomplete identity configuration.

Roles: Employee, Head, Finance, Admin, with explicit permission checks. Head role and legal OT eligibility are separate. An employee sees own objects; a Head sees assigned reports' review objects; Finance sees financial objects needed for its work, not all medical leave details. Admin does not bypass Finance self-verification/self-payment controls. The owner/head managerial step is SYSTEM_SKIPPED, not a self-approval. Every batch is revalidated item-by-item within its transaction.

UAT uses a separate synthetic database and test-created server sessions injected by the test runner. There is no public test-login route and no employee password workaround. Test seeding refuses production or non-test database targets. Synthetic salaries, names, policies and documents are never presented as the real company roster.

## Transactions and financial integrity

Use PostgreSQL transactions and row locks for submission, review, leave reservation, settlement, batch allocation and payment. Acquire locks in stable order for multi-item operations. Unique constraints protect request numbers, identity mappings, idempotency keys, payable allocations and export keys. Expected revisions prevent stale writes. Idempotency binds principal, operation scope, key and canonical input hash; identical retries return the original receipt, changed input returns 409.

Money is nonnegative bigint satang in ordinary transactions, serialized as decimal strings. Ratios and rates use integer/rational arithmetic; rounding is explicit and covered by tests. No IEEE floating-point money calculations. Distances are integer metres, rates satang/km. OT categories are policy IDs with rational/basis-point multipliers, not hard-coded UI columns. Stored calculation snapshots include policy version/hash, wage basis where authorized, input units, rounding and resulting amount. Do not silently rerate historical requests.

Approval actions, submitted request revisions and audit events are append-only. Published policy content is immutable. Paid/exported financial records cannot be edited in place; correction is a linked adjustment with its own approval and payment/export treatment. Original receipt updates remain separately auditable and do not alter the paid amount.

A Trip expense allocated to settlement is not independently payable. Paid advance principal is a cash movement, not a second expense. Settlement freezes eligible actuals and advances. Positive net creates only the top-up obligation; negative net requires independently verified employee refund. Closing a settlement requires net cash reconciliation. These rules are transaction invariants, not UI conventions.

## Policy and time

Store business dates as ISO dates and instants as timestamptz. Central calendar service uses Asia/Bangkok regardless of the user's device timezone. The payroll cutoff is an exclusive instant: the end of the last working day before the nominal 24th, represented by local midnight immediately after that working day. The company holiday calendar is explicit. A late approval enters the next eligible open cycle; closed/exported membership is frozen. Payroll payday remains nominally the 25th; bank-day execution changes are separate operational configuration.

Settlement is due trip-end local date + 3 calendar days; no implicit weekend extension. Due-today ends at local midnight. Per-diem rates and rounding/counting rules are versioned; unspecified production amounts remain unconfigured rather than silently zero. Leave entitlement, paid cap, policy period/event and working/calendar counting are separate concepts. Legal references and unresolved applicability are recorded in docs/LEGAL_BASELINE_V1.md; company publication cannot reduce applicable statutory floors.

## Storage and document security

Storage interface: put/get/exists with opaque immutable keys, content hash and private authorized download. Filesystem storage is allowed for isolated UAT with a private root; production uses a private S3-compatible object-storage adapter. OCI Object Storage remains a valid remote storage option even though compute runs on Infinity ESXi. Bucket credentials stay in runtime secret configuration. Do not expose permanent public object URLs or original user-supplied paths.

Enforce bounded upload sizes, filename sanitization, actual MIME/magic checks, randomized storage keys, authorized owner links and SHA-256 metadata. Strip image metadata/re-encode where supported; PDFs require a configured scanning/quarantine path before being treated as clean evidence. Download rechecks object permission and uses no-sniff/private cache headers; untrusted active content is not rendered inline. Medical documents have narrower access than ordinary expense receipts. Digital evidence and original paper state remain independent.

## Jobs and external boundaries

Claim jobs with FOR UPDATE SKIP LOCKED and a bounded visibility lease. Store attempts, next-run time, terminal result and redacted error code. Recovered jobs may replay only idempotent operations. Transactional outbox creation occurs with business mutation. In-app notification keys and export keys prevent duplicates. Worker heartbeat/liveness and stale job age are observable.

Microsoft integration is read-only GET against configured tenant/site/list/column mapping, with paging and source IDs/ETags. Preserve historical project snapshots and mark stale/inactive references. No local authoritative Project Master editing and no production Microsoft writes in UAT.

Google Routes adapter is disabled until credentials and applicable retention rights are confirmed. Distinguish transient provider content from employee-attested financial evidence. Never call manual distances Google-verified or recompute paid claims on a new route response. The architecture allows a properly licensed retained route snapshot without assuming a right to retain all provider content indefinitely.

Easy-ACC and Smartbiz interfaces accept immutable input snapshots and return artifact/receipt metadata. Until supported formats are verified, vendor exports return configuration-required. A neutral CSV for review is explicitly not a vendor import; sanitize formula-injection cells. No direct bank transfer API is implemented: payment actions record an externally completed petty-cash/transfer payment with its reference.

## Operations, recovery and rollout

Health proves process liveness. Readiness proves required environment, database reachability and expected migrations; worker readiness/heartbeat is checked separately. Optional integration state is explicit, not a fake universal green. Structured logs contain request/correlation IDs, action, duration and safe error codes, not tokens, salary payloads, home addresses or receipt contents.

Migrations are ordered and checksum-verified under a migration lock. Initial deploy requires an empty isolated database; upgrades use expand/backfill/contract, not destructive automatic repair. Record exact source commit, lockfile, image identity and migration set. Back up PostgreSQL plus object metadata/content with encryption and bounded retention; exercise restore into a separate database/storage prefix before cutover. Target RPO 24 hours and RTO 4 hours are operational targets requiring measured acceptance, not guarantees.

CI runs frozen install, format, lint, typecheck, unit/integration tests, build and isolated browser tests. Container build is a separate gate. Push verified feature-branch milestones without rewriting history; do not merge main before acceptance. OCI UAT remains a valid engineering/UAT plane and must prove app/worker start, health/readiness, migrations, persistence and restart at the highest sanctioned runtime available. Production container acceptance, however, runs on the dedicated Infinity ESXi Linux VM. Do not weaken OCI worker isolation or couple production availability to the OCI VPN stack merely to obtain a Docker pass.

Production rollout on Infinity ESXi requires a dedicated Linux VM, real roster/roles/wage eligibility, verified company policies/holidays, Entra credentials, private S3-compatible storage/scanning, backup destination, hostname/TLS and explicit live cutover approval. Unsupported vendor formats/Google rights remain named integration blockers, not reasons to stop independent core implementation.
