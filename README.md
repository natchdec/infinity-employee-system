# Infinity Employee System

ระบบงานพนักงานของ Infinity Solution Service สำหรับการลา, OT, ค่าใช้จ่าย/ค่ารถ, Mileage, Business Travel, เงินทดรอง, Approval, Finance, Payroll, Project Master และงานผู้ดูแลระบบ

> Production application: `employee.infinitysolutions.co.th`
> Current production source baseline: `6fb04e179df9a57aa110a4a1e7aec07eb06c799a`
> Primary implementation branch: `feat/v1-implementation`

## คู่มือการใช้งาน

- [คู่มือพนักงานทั่วไป](docs/manuals/EMPLOYEE_USER_MANUAL_TH.md)
- [คู่มือ Admin และงานการเงิน](docs/manuals/ADMIN_FINANCE_MANUAL_TH.md)
- [คู่มือและเอกสารทั้งหมด](docs/manuals/README.md)

คู่มือใน repository เป็น source of truth แบบ Markdown และอ้างอิงภาพ UAT ที่ถูกเก็บใน `evidence/` เพื่อให้เปิดอ่านได้โดยตรงบน GitHub และอัปเดตตาม source code ได้ง่าย

## ขอบเขตระบบ

### Employee
- สร้างคำขอ ลา / OT / ค่าใช้จ่ายและค่ารถ / Business Trip / Cash Advance
- ดูคำขอและสถานะ Approval / Finance / Payment
- ใช้ Outlook Calendar Inbox เพื่อ Review Draft จาก Category `IES · ...`
- อัปโหลดใบเสร็จเข้า Receipt Inbox แล้วเลือกใช้กับ Expense
- คำนวณ Mileage จาก Google Maps / Routes พร้อม Home Address และ Commute Baseline
- ดู Monthly Operational Statement, Notifications และ Needs Attention

### Head / Owner
- Approval ตาม Reporting Line
- Head/Owner self-request ข้าม Manager approval ตาม policy
- รองรับ Approval Delegation
- Final Approver สามารถกำหนดแยกตามประเภทคำขอ

### Finance
- Finance Verify
- Payment Batch / Separate Transfer / Petty Cash
- Original Receipt tracking
- Settlement และ Cash Advance
- OT / Payroll queue
- Review export สำหรับ EASY-ACC
- Accounting export workflow สำหรับ Smartbiz
- Project P&L / Reconciliation / Monthly Closing / Operations
- Finance ไม่สามารถ Verify หรือ Paid รายการของตนเอง

### Admin
- Employee / Role / Head-Owner / Department
- Microsoft 365 Directory review และ mapping
- Department และ Reporting Line แบบ effective-dated
- Approval Rules แยกตามประเภทคำขอ
- Policy Center / Working Schedule / Holiday
- Project Integration กับ Microsoft Lists / SharePoint
- Auditability ของ configuration changes

## Workflow หลัก

```text
Employee Request
      |
      v
Reporting Line Approval
      |
      +---- Head/Owner self-request -> SYSTEM_SKIPPED
      |
      v
Final Approver (ถ้ากำหนด)
      |
      +---- Leave / Trip -> Approved
      |
      +---- OT -> Payroll Queue
      |
      +---- Expense / Advance -> Finance Verify
                                 |
                                 v
                            Finance Payer
                                 |
                                 v
                           Payment / Batch
```

## Integration

| Integration | Purpose | Current model |
|---|---|---|
| Microsoft Entra ID | Sign-in / identity | OIDC |
| Microsoft Graph / Outlook | Calendar Inbox | Read categorized work events |
| Microsoft 365 Directory | Directory review | Admin-controlled mapping |
| Microsoft Lists / SharePoint | Project Master | Source of project/PO data |
| Google Maps / Routes | Mileage route | Preview + route snapshot rules |
| Cloudflare Zero Trust | Production access | Access + Tunnel / private routing |
| EASY-ACC | Payroll target | Fail-closed until sanctioned API/bridge mapping is finalized |
| Smartbiz | Accounting target | Fail-closed until approved desktop bridge/import contract is finalized |

## Project Master และ Project Cost

Project Master จะรวม source rows ที่มี PO เดียวกันเป็นหนึ่ง Project สำหรับผู้ใช้ แต่ยังคง source identity เพื่อ audit

Project Ledger ใช้แนวคิด:

```text
Current Margin = Revenue - Planned Cost - Actual Employee Cost
```

ข้อมูล Revenue / Cost / Margin เปิดเฉพาะ Finance/Admin เท่านั้น พนักงานทั่วไปจะเห็นเฉพาะข้อมูล Project ที่จำเป็นต่อการสร้างคำขอ

## Security / Guardrails

- Employee role เป็น baseline role
- Head/Owner self-request ไม่ต้องอนุมัติคำขอตัวเองใน Manager step
- Finance ต้องแยกผู้ตรวจสอบ/ผู้จ่ายตาม configured routing
- Finance ห้าม Verify หรือ Paid รายการของตนเอง
- Project financials จำกัดเฉพาะ Finance/Admin ที่ server query boundary
- Approval/Policy changes เป็น versioned/effective-dated ตามส่วนที่รองรับ
- Export/bridge ที่ยังไม่ sanctioned จะ fail closed
- Production ingress อยู่หลัง Cloudflare Access

## UX / Responsive

ระบบรองรับ Employee แบบ mobile-first และ Head/Finance/Admin แบบ responsive desktop/tablet/mobile

หลักฐาน UI/UAT:
- `evidence/app-uat/`
- `evidence/design/`

ขนาดหลักที่ตรวจไว้:
- Mobile: 390 px
- Tablet: 820 px
- Desktop: 1440 px

## Technology

- Next.js 16
- React 19
- TypeScript 6
- PostgreSQL
- Drizzle ORM
- Microsoft Entra OIDC
- Worker process
- Docker Compose
- Object storage / document scanning pipeline
- Playwright browser UAT
- Node.js 24
- pnpm 11

## Development

Prerequisites:
- Node.js `>=24 <25`
- pnpm `11.22.0`
- PostgreSQL

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Default local web:
```text
http://127.0.0.1:4311
```

## Verification

Run the complete source gate:

```bash
pnpm verify
```

This runs:
1. Prettier check
2. ESLint
3. TypeScript
4. automated tests
5. Next.js production build

Browser/UAT scripts are under `scripts/` and evidence is stored under `evidence/`.

## Deployment

Production deployment artifacts and operational examples are under:

- [`deploy/README.md`](deploy/README.md)
- `docker-compose.yml`
- `docker-compose.production.yml`

Production VM:
```text
INFINITY-EMPLOYEE-PROD01
172.20.11.220
```

The runtime deployment is performed through the controlled Infinity VPN execution path. Do not bypass production networking or credential isolation.

## Canonical project documents

- [`PROJECT.md`](PROJECT.md) — scope and goals
- [`SOT.md`](SOT.md) — verified current truth
- [`DECISIONS.md`](DECISIONS.md) — accepted architecture/product decisions
- [`ROADMAP.md`](ROADMAP.md) — milestone/future work
- [`UX.md`](UX.md) — accepted UX behavior
- [`AGENTS.md`](AGENTS.md) — repository agent instructions

## Repository structure

```text
src/app/              Next.js routes / pages
src/components/       shared UI + request components
src/server/           services, queries, integrations, policies
src/domain/           domain contracts
migrations/           database migrations
tests/                automated regression tests
scripts/              UAT, migration, sync and operational scripts
deploy/               production deployment support
docs/                 project documentation and manuals
evidence/             captured UAT/design evidence
```

## Branch / release workflow

Implementation work is performed on `feat/v1-implementation`, verified, pushed, and then merged into `main`.

Do not force-push `main`.
