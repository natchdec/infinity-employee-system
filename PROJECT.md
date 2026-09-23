# Infinity Employee System

## Status
V1 implementation is in progress on Agent Gateway OCI. The M0 foundation/runtime milestone is verified in isolated UAT; transactional V1 workflows are being implemented next.

## Objective
Build a mobile-first employee self-service system for Infinity Solution Service covering leave, OT, expenses, business travel, cash advances, approvals, finance verification, payroll handoff, accounting handoff, policy management, document evidence, and audit.

## Organization
- One company.
- 11 permanent monthly employees.
- Salary/payroll date: 25th of each month.
- Working hours: Monday-Friday, 09:00-18:00, lunch 12:00-13:00.
- Payroll claims must be fully approved before the 24th. If the 24th falls on a non-working day, completion is required before that day. Late approvals move to the next payroll cycle.

## V1 Scope
- Microsoft Entra ID login.
- Employee and organization structure.
- Leave management.
- OT request and payroll queue.
- Expense claims including mileage, taxi, Grab, toll, parking, rental car, fuel, entertainment, and other categories.
- Business Trip.
- Domestic and international per diem.
- Cash Advance and settlement within 3 days after trip end.
- Configurable approvals and owner/head auto-skip.
- Finance verification and conflict-of-interest controls.
- Petty cash / separate transfer payment batches.
- Original receipt tracking after payment.
- Payroll export adapter for Easy-ACC.
- Accounting export adapter for Smartbiz.
- Microsoft Lists / SharePoint Project Master integration.
- Mobile-first PWA.
- Audit trail and policy versioning.
- Docker-first deployment on OCI.

## Out of Scope for Initial V1
- LINE OA as primary UI.
- Direct write integration to Easy-ACC or Smartbiz before supported import/API format is verified.
- Kubernetes and microservices.
- Multi-company support.
- Half-day or hourly leave.
- Foreign exchange engine beyond extensible currency fields.

## Success Criteria
- Employees can complete common requests comfortably from a phone.
- Heads can approve employee requests with minimal steps.
- Owner/Head requests do not require self-approval.
- Finance cannot verify or mark paid its own claim.
- Finance can close payment and payroll batches with traceable audit evidence.
- Policies can change without source-code edits.
- Every material state change is auditable.
