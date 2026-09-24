# Roadmap

## Phase 0 - Blueprint, UX and Foundation
- [x] Confirm workflows, roles, policies, architecture, and data model.
- [x] Create Employee Mobile, Head Approval, Finance Desktop, and Admin UX contracts and visual evidence.
- [x] Establish Quiet Enterprise / Modern Editorial component system.
- [x] Build Next.js/PostgreSQL foundation, Entra OIDC boundary, role-aware shell, worker, health/readiness, migrations, and isolated OCI UAT.
- [x] Verify source gates and M0 runtime UAT.
- [x] Complete implemented-app browser/Taste/Astra visual gate across Employee, Head and Finance surfaces.

## Phase 1 - Core V1
- [x] Foundation: App Router, PostgreSQL, migrations, policy engine, audit primitives, worker, runtime UAT.
- [x] Identity/organization foundation and role-aware query boundary.
- [x] Transaction command service and API: submit/resubmit/cancel, Head approve/return/reject, Finance verify/return, idempotency, revision fencing and API CSRF boundary.
- [x] Leave transactional workflow.
- [x] OT and payroll-cycle workflow.
- [x] Expense including Entertainment, mileage and receipt/document flow.
- [x] Business Trip, Per Diem, Cash Advance and settlement.
- [x] Finance verification and original-receipt tracking.
- [x] Petty cash / transfer payment batches.
- [x] Neutral payroll/accounting review exports and fail-closed Easy-ACC/Smartbiz adapter boundaries.
- [x] Responsive browser hardening and implemented-app UAT at 390/820/1440.
- [ ] PWA installability/offline-shell hardening.
- [ ] Microsoft Lists/SharePoint Project Master production read sync.
- [ ] Google Routes verified mileage automation.
- [ ] Verify and enable exact Easy-ACC supported export/import format.
- [ ] Verify and enable exact Smartbiz supported export/import format.
- [ ] Live Docker Compose verification on a sanctioned OCI host/deployment path.
- [ ] Production identity/object-storage configuration and production rollout readiness.
- [ ] Explicit cutover approval.

## Phase 2 - Project and Automation Enhancement
- Project cost reporting.
- Teams notifications.
- Operational dashboards and finance reconciliation enhancements.

## Phase 3 - Convenience Integrations
- LINE OA rich menu.
- Deep links into PWA.
- Receipt Inbox via LINE.
- Additional automation around reminders and document intake.
- Advanced reporting and project profitability.
