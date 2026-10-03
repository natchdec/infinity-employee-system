# Decisions

## D-001 Product Shape
Use one Infinity Employee System with modular business domains rather than separate applications.

## D-002 Deployment
Use Docker Compose and a modular monolith. Production runs inside a dedicated Linux VM hosted on Infinity ESXi. Do not deploy the Employee System application on Agent Gateway OCI. Do not start with Kubernetes or microservices.

## D-003 Identity
Use Microsoft Entra ID. Do not maintain a separate employee password database.

## D-004 Project Master
Use Microsoft Lists/SharePoint as the authoritative Project Master and surface it in Microsoft Teams. Employee System keeps only a read-only `ProjectReference` projection and immutable request snapshots; it never maintains a duplicate writable master. As of 2026-09-30 Project Master is active production scope. Multiple SharePoint source rows with the same normalized PO Number are one business Project for selection, Project Master UX, and project-cost reporting; the original source rows, source IDs, ETags, and line-specific descriptions remain separate for audit and synchronization. Rows without a PO Number remain independent Projects. Missing optional Engineer Lead or Cost Center semantics at the source are shown as unavailable and must never be invented; their absence does not block sync of the authoritative fields that do exist.

## D-005 Mobile Strategy
Web/PWA is the primary UI. LINE OA is a later companion for deep links, notifications, and optional receipt inbox workflows.

## D-006 Approval
Employee requests go to their line Head where approval is required. A Head/Owner never self-approves. Finance verification remains distinct from managerial approval.

## D-007 Finance Conflict
A Finance user cannot verify or mark paid their own claim.

## D-008 Leave
Leave is recorded in full-day units only. Policies follow legal defaults with versioned company overrides.

## D-009 OT
Final OT requests store policy category and hours in 0.5-hour increments (minimum 0.5) against a task/project. Calendar start/end timestamps may be used to propose a draft, but submitted OT remains a reviewed hour quantity rather than a mutable time-range claim. OT is paid via payroll.

## D-010 Expense
Entertainment is an Expense subtype, not a separate top-level module.

## D-011 Travel
Business Trip and Cash Advance are included in V1. Settlement is due within 3 days of trip end.

## D-012 Mileage
Mileage rate starts at 8 THB/km. Normal commute is deducted per eligible leg. Google Maps Routes is the target distance source for transient, no-store route previews. Under the standard Google Maps Platform terms, preview distance/duration is not retained as permanent provider evidence; the employee reviews the previewed distance and the submitted mileage remains employee-attested. Durable Google provider evidence stays fail-closed unless separate documented licensing grants the required retention rights.

## D-013 Finance Systems
Use adapters for Easy-ACC payroll and Smartbiz accounting. Do not hard-couple the core system to undocumented direct APIs.

## D-014 Receipt Handling
Digital receipt may allow payment before original paper receipt arrives. Original receipt status is tracked separately.

## D-015 UX Direction
Use Quiet Enterprise / Modern Editorial design. Avoid AI-template aesthetics: neon/black defaults, excessive gradients, glassmorphism, oversized stat cards, decorative glow, and unnecessary assistant UI.

## D-016 OCI Role
Agent Gateway OCI remains a separate automation and remote-connectivity platform. Its Docker VPN containers may connect AGW OCI to customer or remote networks, but Employee System production availability must not depend on the OCI VPN stack unless a later explicit architecture decision says otherwise.


## D-017 Calendar-assisted worklog
Outlook Calendar is a draft source, never proof or an auto-submit channel. Only events explicitly categorized with an Infinity Employee System category are eligible for ingestion. The system may derive OT, Onsite mileage, or full-day Leave suggestions, but the employee must review before creating requests. Submitted requests are immutable from later Calendar edits; source changes are surfaced as audited exceptions.

## D-018 Monthly operations close and adjustments
Operational periods may move Open -> Closing -> Locked. Locked payroll/claim history is not edited in place. Corrections use linked Adjustment records and follow the applicable approval/payment/export treatment in a later eligible period.

## D-019 Delegation, exceptions and reminders
Effective-dated approval delegation is allowed only when it preserves no-self-approval and Finance independence. Exception and notification queues surface work requiring human action; they do not bypass policy or approval.

<!-- agent-gateway:managed:start:production-storage-and-shared-graph-20260930 -->
## D-020 Production Document Storage
For the current production cut, keep receipt/document binaries on private host-backed storage inside the dedicated Infinity ESXi application VM. The application container uses `/data/documents` backed by the VM host directory (default `/srv/infinity-employee/documents`). S3-compatible storage is not a production requirement for this cut. Database and document storage are both included in backup/restore acceptance.

## D-021 Shared Read-only Microsoft Graph Identity
Microsoft 365 Directory, Outlook Calendar and Project Master use the same approved read-only Microsoft Graph application identity/certificate where tenant scope permits. Project Master source identifiers and verified column/lookup mapping remain independent configuration. The Employee System never writes Project Master data back to Microsoft Lists/SharePoint.
<!-- agent-gateway:managed:end:production-storage-and-shared-graph-20260930 -->


## D-022 Microsoft 365 Directory Review
Microsoft 365 Directory synchronization remains a read-only tenant identity inventory and never grants Employee System access automatically. Admin explicitly promotes an enabled Microsoft 365 Member to an Employee with a verified department and hire date, or marks an unlinked directory identity as not an employee. Non-employee classification is local review state rather than deletion from Microsoft 365, so subsequent directory synchronization preserves the decision. Linked Employees continue to use the existing Admin Employee controls for department, roles, Head/Owner state, reporting line, and activation.
