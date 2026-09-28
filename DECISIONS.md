# Decisions

## D-001 Product Shape
Use one Infinity Employee System with modular business domains rather than separate applications.

## D-002 Deployment
Use Docker Compose and a modular monolith. Production runs inside a dedicated Linux VM hosted on Infinity ESXi. Do not deploy the Employee System application on Agent Gateway OCI. Do not start with Kubernetes or microservices.

## D-003 Identity
Use Microsoft Entra ID. Do not maintain a separate employee password database.

## D-004 Project Master
Use Microsoft Lists/SharePoint as the authoritative Project Master and surface it in Microsoft Teams. Employee System references Project IDs rather than maintaining a duplicate master.

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
Mileage rate starts at 8 THB/km. Normal commute is deducted per eligible leg. Google Maps is the target distance source.

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
