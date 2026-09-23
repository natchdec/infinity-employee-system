# Implementation Plan V1

Execution plane: Agent Gateway OCI, workspace e1dd59e3-bce9-489d-be6c-c965e62daf2c, project project_5c01804a850041be9adf8b135b0700f0. Repository natchdec/infinity-employee-system; reuse feat/v1-implementation. This plan is followed by implementation, not a stopping point.

## Dependencies and milestones

Design audit -> screen/component contract -> rendered critique/lock -> architecture/data model -> M0 -> M1 -> M2. M3 Leave and M4 OT then use policy/approval; M5 Expense/documents/mileage uses identity and policy; M6 Trip/Advance/Settlement uses Expense and Finance obligations; M7 Finance batches/exports completes cash/payroll handling. M8 project-master and M9 routing adapters are read-only integration boundaries and can progress without production credentials. M10 verifies the combined runtime. External configuration does not block independent core code.

| Milestone | Deliverable | Required gate before calling it verified |
| --- | --- | --- |
| Design | Audit, complete inventory, shared states, component contract, candidate prototype, Taste/Astra findings | Source fingerprints, 390/820/1440 screenshots, actual image inspection, resolved blocking a11y/overflow/workflow findings; no claim of backend UAT |
| Architecture | System/data/security/deployment contracts and legal register | Requirement/invariant traceability and no fake external formats |
| M0 | TypeScript/Next tooling, config, health/readiness, PostgreSQL migration runner, worker shell, logging, Docker/CI | Format/lint/types/unit/build; clean/repeat migration on actual PostgreSQL; process starts |
| M1 | Entra code/PKCE boundary, hashed server sessions, roles, roster/reporting/wage/commute | Unauthorized/object isolation tests; real Entra live callback remains separate credential gate |
| M2 | Effective immutable policies, request rounds, Head/system skip, Finance COI, audit/idempotency | Transition, stale revision, duplicate and cross-role negative tests |
| M3 | Full-day Leave, entitlement/paid caps, reservations/ledger/history | Full-day/effective-date/overlap/balance/cancellation tests |
| M4 | Policy integer OT, wage basis, central cutoff, payroll cycles/items | Integer/category/rate/cutoff/weekend/holiday/year-boundary tests; no invented Easy-ACC import |
| M5 | Expense types/Entertainment, private documents, independent original state, mileage legs | Upload/authorization/receipt-state/route-snapshot/per-leg tests |
| M6 | Trip/per diem/advance/settlement and net obligations | Both net refund/top-up examples, due logic, pending actuals, double-payment prevention |
| M7 | Finance verification, originals queue, batches/payment recording, review exports/reports | Self-verification/payment prohibition, concurrent payment/export idempotency, immutable paid data |
| M8 | Read-only Microsoft project projection and readiness/error states | Fixture/contract tests and production read only when configured; never production mutation |
| M9 | Route provider contract, manual attestation, immutable permitted evidence | Correct deductions/versioning; live Google credentials/retention rights are separate |
| M10 | Integrated UAT, worker/restart/persistence, backup/restore, Docker and remote CI | Exact terminal receipts per layer; unresolved gates explicitly named |

## Repository layout

src/app: Next routes, layouts, API handlers and static metadata. src/ui: shell, form/list/detail components and screen registry. src/domain: pure money/date/policy/calculation/authorization/transition functions. src/server: config, database, sessions, transactional services, storage and adapter implementations. src/worker.ts: durable job loop. migrations: ordered SQL with checksums. scripts: migration, guarded synthetic seed/UAT, browser checks and operational helpers. tests: unit, PostgreSQL integration, HTTP/security and browser tests. design: explicit synthetic design instrument. docs: legal, screen, operational and acceptance registers. evidence: redacted machine-readable reports and non-sensitive screenshots. deploy: reverse proxy/backup/runbooks. No generated credentials in Git.

## Database and seed order

First create migration bookkeeping and identity/organization. Then policy/project references; requests/immutable rounds/actions/audit/command receipts; domain details/leave ledger/reservations; payroll; documents; obligations/batches; Trip settlements; jobs/notifications/session state. Add indexes, nonnegative/integer checks, active allocation uniqueness and immutable guards before using services. Run each migration transactionally under a lock and reject changed checksums.

Production starts without fabricated employees, salary, project rows or unverified company rates. Legal/reference defaults and explicit company settings are distinguished from enabled policy. Synthetic seed requires an isolated UAT/test environment, loopback test database and explicit opt-in. Create several role combinations including two independent Finance actors; do not pretend this is the actual 11-person roster. Test sessions are injected by the runner, not a login endpoint.

## Implementation method

Keep domain calculation pure and clock-injected. Server loads applicable policy/wage/commute, validates draft/evidence, computes the authoritative snapshot and records submission in a transaction. Role/object checks and COI live in services, not just UI. Use stable request numbers for people and UUIDs internally. Separate mutable draft, optimistic revision and immutable submitted round. Multi-object financial operations lock in stable order. Idempotency receipt and business writes commit together.

Build vertical flows, not disconnected mock pages: create/edit draft -> preview -> submit -> Head approve/return -> Finance verify -> payable/batch/paid -> original receipt. Add Trip allocation and settlement without paying actuals twice. Build route contracts with shared components, but each screen must read real permitted state and provide functional actions or an explicit genuine integration/configuration boundary. No fake successful buttons.

## Testing strategy

Unit tests cover rational money/rounding, full-day dates, effective policy, statutory floors, integer OT, per-leg commute, cutoff and settlement due/net. PostgreSQL tests cover migrations, constraints, row-lock concurrency, rollback, append-only records, reservations and unique allocations. HTTP tests cover sessions, Origin/CSRF, role/object boundaries, safe errors, private documents and same-key/different-payload conflicts. Browser tests use isolated synthetic accounts and real API/database persistence; test employee, Head, Finance and owner-COI happy/negative paths at mobile/tablet/desktop.

Run axe and layout checks, then inspect actual images for typography, hierarchy, density and Thai copy. Automated a11y is not a complete accessibility audit. Candidate prototype evidence does not replace implemented-app screenshots. Test restore in a different database/storage prefix; do not restore over a live target. Keep accepted evidence bound to source SHA, schema/lockfile and runtime identity.

## OCI, Docker and CI

Live preflight found ARM64 Linux, Node24, pnpm11, Git/GitHub access, Chromium, substantial free disk/RAM; no Docker CLI/socket in the worker. Recheck rather than assuming this remains permanent. Use an isolated native PostgreSQL test cluster where sanctioned, while separately checking existing authorized OCI host deployment access. Never mount a host Docker socket or weaken worker isolation to manufacture a Docker pass.

Compose services are employee-app, employee-worker, postgres and reverse-proxy, with distinct project/volume/network names. Loopback UAT only until hostname/TLS/cutover approval. Non-root app/worker, private database, runtime secrets, health checks and bounded resources. CI uses frozen lockfile and real PostgreSQL service, runs all source gates/build, then browser/runtime/container gates as configured. Remote CI status must be read from GitHub, not inferred from a push.

## Git/checkpoint policy

Fetch before work; initial main/origin equality was verified. Reuse feature branch; never force push. Commit coherent milestones: reviewed design, architecture/model, verified foundation, domain vertical slices, hardening. Record which gates actually ran for that milestone; a design commit is not a production release. Push each verified checkpoint, compare local and remote SHA and inspect CI separately. Keep main untouched until acceptance.

Before large changes read project.context/revision and hold bounded path leases. Checkpoint significant milestones with exact commit, current phase, passed gates and remaining blockers. Update PROJECT/SOT/DECISIONS/ROADMAP/UX/AGENTS through sanctioned paths; do not dump raw logs. Release leases at closure or handoff.

## Rollback and production cutover

A source rollback is a new revert commit, not history rewrite. Image rollback requires schema compatibility and retained previous artifact. Prefer expand-only migrations; never silently delete financial data to make a test pass. Before live cutover verify real Entra mapping, roster/wage eligibility, policies/holidays, object storage/scanning, backups/restore, hostname/TLS and operational ownership. Get explicit approval for a cutover affecting live users. Vendor format, Microsoft mapping and Google rights/credentials remain named integration gates. Report DONE/VERIFIED/NOT DONE/WHY/BLOCKER/NEXT SANCTIONED ACTION exactly when execution closes.
