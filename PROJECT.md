# Infinity Employee System

## Status
Core transactional V1 and the installable/offline-safe PWA are usable and verified in isolated Agent Gateway OCI UAT. Production identity, external provider formats/credentials, live Docker deployment on the Infinity ESXi environment, and production cutover remain separate acceptance gates.

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
- Microsoft Lists / SharePoint Project Master integration as an active production feature: read-only sync, searchable list/detail, request selection, Admin sync/readiness and Finance project-cost drill-down.
- Mobile-first PWA.
- Audit trail and policy versioning.
- Docker Compose deployment on a dedicated Linux VM hosted on Infinity ESXi. Agent Gateway OCI remains a separate automation/VPN platform and is not the Employee System production application host.

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
- Project Master remains authoritative in Microsoft Lists/SharePoint; Employee System exposes source identity/freshness and never invents missing Engineer Lead or Cost Center values.
