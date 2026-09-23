# Roadmap

## Phase 0 - Blueprint, UX and Foundation
- [x] Confirm workflows, roles, policies, architecture, and data model.
- [x] Create Employee Mobile, Head Approval, Finance Desktop, and Admin UX contracts and visual evidence.
- [x] Establish Quiet Enterprise / Modern Editorial component system.
- [x] Build Next.js/PostgreSQL foundation, Entra OIDC boundary, role-aware shell, worker, health/readiness, migrations, and isolated OCI UAT.
- [x] Verify source gates and M0 runtime UAT.
- [ ] Complete final browser/Taste/Astra visual lock on implemented transactional screens as each workflow becomes live.

## Phase 1 - Core V1
- [x] Foundation: App Router, PostgreSQL, migrations, policy engine, audit primitives, worker, runtime UAT.
- [x] Identity/organization foundation and role-aware query boundary.
- [ ] Transaction command service and API: submit, approve, return, reject, finance verify/return.
- [ ] Leave.
- [ ] OT and payroll-cycle workflow.
- [ ] Expense including Entertainment and receipt/document flow.
- [ ] Business Trip, Per Diem, Cash Advance and settlement.
- [ ] Finance verification and original-receipt tracking.
- [ ] Petty cash / transfer payment batches.
- [ ] Easy-ACC adapter boundary and verified export format.
- [ ] Smartbiz adapter boundary and verified export format.
- [ ] Responsive PWA hardening and end-to-end browser UAT.
- [ ] Docker Compose live verification on a sanctioned OCI host/deployment path.
- [ ] Production rollout readiness and explicit cutover approval.

## Phase 2 - Project and Automation Enhancement
- Microsoft Lists/SharePoint Project Master sync.
- Google Maps mileage automation.
- Project cost reporting.
- Teams notifications.
- Operational dashboards and finance reconciliation enhancements.

## Phase 3 - Convenience Integrations
- LINE OA rich menu.
- Deep links into PWA.
- Receipt Inbox via LINE.
- Additional automation around reminders and document intake.
- Advanced reporting and project profitability.
