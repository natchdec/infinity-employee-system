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
- Next.js App Router foundation, Entra OIDC boundary, role-aware server pages, PostgreSQL access, structured logging, health/readiness routes, and PostgreSQL-backed worker exist.
- Isolated OCI UAT uses PostgreSQL 18.4 over a private Unix-domain socket with no TCP listener.
- Database migrations: 3 total; checksum verification passes and restart persistence is verified.
- Synthetic UAT seed contains 6 non-production identities and 8 policy families; real employee data is not seeded.
- Source gates pass: format, lint, typecheck, 39/39 domain tests, and Next production build.
- Runtime UAT passes health 200, readiness 200, unauthenticated redirect, Employee/Head/Finance/Admin protected pages, worker heartbeat, and exactly-once durable in-app notification delivery.
- Docker CLI/socket is not exposed inside the OCI worker; live Docker Compose verification remains a separate sanctioned host/deployment gate.
