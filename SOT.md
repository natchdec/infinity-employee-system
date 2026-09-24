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
- OCI is the target initial production hosting environment.

## Verified Implementation State
- Active branch: feat/v1-implementation.
- M0 foundation and M1/M2 transaction engine are already committed and synchronized to origin.
- Next.js App Router, Entra OIDC boundary, role-aware server pages, PostgreSQL access, structured logging, health/readiness routes, and PostgreSQL-backed worker exist.
- Isolated OCI UAT uses PostgreSQL 18.4 over a private Unix-domain socket with no TCP listener.
- Database migrations: 3 total; checksum verification and restart persistence pass.
- Synthetic UAT seed contains 6 non-production identities and 8 policy families; real employee data is not seeded.
- Source verification passes format, lint, typecheck, 40/40 tests, and Next production build.
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
- Health and readiness return HTTP 200 on the current isolated UAT stack.
- UAT process evidence shows supervisor timeout/stop behavior can leave an idle PostgreSQL client session during smart shutdown; UAT recovery is bounded to the isolated database and does not change product persistence semantics.
- Docker CLI/socket is not exposed inside the OCI worker; live Docker Compose verification remains a separate sanctioned host/deployment gate.

## External Readiness Gates
- Production Entra tenant/client credentials and redirect registration.
- Production OCI Object Storage/S3-compatible bucket credentials.
- Microsoft Lists/SharePoint Project Master production source connection and field mapping.
- Google Routes credential/provider verification for automated route quotes.
- Verified Easy-ACC supported import/API format.
- Verified Smartbiz supported import/API format.
- Sanctioned host/deployment access for live Docker Compose verification.
- Explicit authorization before production cutover affecting live users.
