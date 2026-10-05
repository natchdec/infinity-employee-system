# UX

## Experience Principles
1. Mobile-first for employees; desktop-efficient for Finance/Admin.
2. Common employee actions must be reachable in one or two taps from Home.
3. Receipt capture is a primary action, not a hidden file-upload detail.
4. Long forms use progressive sections and autosave drafts.
5. Finance uses dense, readable tables with filters, bulk actions, and clear exception states.
6. Thai language is first-class; layouts must be tested with real Thai copy.
7. One primary action per screen.
8. Status color is semantic only, never the main visual theme.

## Visual Direction
Quiet Enterprise / Modern Editorial.
- Light theme by default.
- Warm neutral page background.
- White working surfaces where needed.
- Charcoal text.
- Infinity brand blue as primary accent.
- Restrained red/orange/green only for error/warning/success.
- Thin borders and subtle elevation.
- 8-12px radius range; avoid pillification.
- Strong typography hierarchy.
- No neon, glow, heavy gradients, glassmorphism, generic dark AI dashboard, or oversized decorative KPI cards.

## Employee Mobile Navigation
- Home
- My Requests
- New Request
- Trips
- Profile

### Employee Home
- Greeting and current payroll cutoff note.
- Primary New Request action.
- Quick actions: Leave, OT, Expense, Trip.
- Needs Attention: settlement due, receipt outstanding, request returned.
- Recent Requests.

### New Expense
- Expense type.
- Project/customer.
- Date.
- Amount or mileage calculation.
- Take Photo / Upload Receipt.
- Notes.
- Save Draft / Submit.
- Entertainment-specific fields appear conditionally.

### OT
- Date.
- Project.
- Task / work description.
- 0.5-hour increment inputs grouped by applicable OT category/multiplier.
- Calculated summary.
- Submit.

### Leave
- Leave type.
- Full-day date or date range.
- Balance before/after.
- Reason / evidence if required.
- Submit.

### Trip
- Project.
- Destination.
- Domestic / International.
- Start/end dates.
- Per diem preview.
- Expected hotel / transport.
- Cash Advance request.
- Submit.

## Head Approval
- Mobile approval inbox.
- Request summary first, detail second.
- Clear approve / return / reject.
- No self-approval step for Head/Owner requests.

## Finance Desktop
Primary areas:
- Claims
- Payment Batches
- Cash Advances
- Settlements
- Receipt Tracking
- Payroll OT
- Accounting Export
- Reports

Finance list screens use compact tables with:
- Employee
- Request type
- Project
- Amount
- Approval status
- Digital receipt
- Original receipt
- Finance verification
- Payment status
- Exception flags

## Admin
- Employees
- Organization
- Policies
- Holidays
- Expense Types
- Approval Rules
- Project Integration
- System Settings

## Initial Mockup Set
1. Employee Mobile Home.
2. Mobile Expense Claim with camera-first receipt capture.
3. Mobile Head Approval detail.
4. Finance Desktop Claims queue.
5. Finance Desktop Payment Batch.
6. Admin Policy configuration.

## Design Acceptance Gate
Before implementation:
- Review at 390px mobile width and standard desktop width.
- Use realistic Thai content.
- Validate hierarchy, density, touch targets, and form length.
- Reject any screen that resembles a generic AI dashboard/template.
- Lock components, spacing, typography, statuses, and navigation before coding.


## Calendar Inbox and Monthly Review
- Outlook integration only considers events explicitly categorized with an `IES · ...` category.
- Supported draft intents: `IES · OT`, `IES · Onsite`, and Thai leave categories.
- Online meetings never create mileage unless the employee explicitly marks the event Onsite.
- Calendar data creates Suggested items only. Employee actions are Review/Edit, Ignore, and Create Monthly Requests.
- The monthly summary shows OT hours, mileage distance/amount, Leave days and items needing review.
- Same-day multiple Onsite events are proposed as one route chain (for example Office -> Customer A -> Customer B -> Office) and require employee confirmation when ambiguous.
- Calendar edits update only unsubmitted drafts. Changes after submission create a visible exception and audit event; they never silently rewrite the request.

## Finance Operations
- Monthly Closing shows pending approvals, Finance verification gaps, receipt gaps, payroll readiness and period state.
- Exception Inbox groups blocking/ambiguous items instead of hiding them across individual screens.
- Receipt Inbox lets employees upload first and assign the receipt to a claim later.
- Employee Monthly Statement provides a period summary without exposing another employee's salary or private claim data.
- Audit Timeline uses human-readable events and redacted metadata.

## Project Master
- Microsoft Lists / SharePoint remains the authoritative source; Employee System is read-only and does not expose local project create/edit actions.
- `/projects` is a searchable Project Master list for authenticated users with Project Code, Name, Customer, Sales Owner, dates and active/inactive state.
- `/projects/[id]` shows source-backed detail, Last Sync and ETag. Missing Engineer Lead or Cost Center is displayed as unavailable rather than inferred.
- New OT and Expense forms may select an active Project; Business Trip requires an active Project. Inactive projects remain readable on historical requests but are not selectable for new requests.
- Admin `/admin/integrations/projects` shows connection readiness, authoritative source, Last Sync, inactive count, missing-field counts and a retry-safe Sync Now action.
- Finance `/finance/projects` is the Project Cost Ledger. `/finance/projects/[id]` drills into Project metadata, OT, verified standalone Expense, Finance-verified Travel settlement, pending Head/Finance queues and recent linked request activity.
- Project surfaces follow the existing Quiet Enterprise visual system and the 390/820/1440 responsive acceptance family; wide tables use local horizontal scrolling instead of document overflow.

<!-- agent-gateway:managed:start:project-master-accepted-ux-20260930 -->
## Project Master Accepted UX — 2026-09-30
- Admin: dedicated Project Integration page with authoritative source identity, sync state, last sync, ETag/freshness, stale/inactive visibility, readiness diagnostics and retry-safe Sync Now.
- Employee: searchable Project Master list/detail plus active-project picker in OT, Expense and Trip flows where project attribution applies.
- Finance/Admin: Project Cost Ledger and project drill-down showing Customer, Sales Owner, Engineer Lead, Start/End, Status, Cost Center, linked OT/Expense/Travel totals, pending queues and recent activity.
- Missing authoritative Engineer Lead or Cost Center values render as unavailable; the UI never infers them.
- Project Master surfaces obey existing role gates and Quiet Enterprise responsive behavior on phone and notebook/browser layouts.
- Financial confidentiality is explicit: Employee/Head project screens show operational Project Master metadata only. Revenue, Cost Center, planned costs, actual costs, margin and P&L are Finance/Admin-only and are not fetched by ordinary-user project queries.
- Mileage origin/destination fields provide Google Maps-style type-ahead suggestions through Google Places. Selecting a suggestion retains its Place ID for route preview; free-text remains available as fallback, and the suggestion surface includes Google Maps attribution.
<!-- agent-gateway:managed:end:project-master-accepted-ux-20260930 -->


## Infinity Corporate Workbench — 2026-10-04
Accepted visual refresh based on the approved Infinity approval-mail direction:
- Corporate white/soft-blue visual language with Infinity blue as the primary accent.
- Shared app shell: branded navigation rail, clear role context, account identity and a soft-blue page hero on every authenticated screen.
- Shared surfaces: 14–18px card radii, restrained elevation, compact semantic status chips, blue-tinted table headers, calmer form fields and clearer sticky actions.
- Employee Home uses icon-led request cards rather than numbered generic tiles.
- Head, Finance and Admin retain their existing workflows and density, but inherit the same shell, cards, forms, tables and status language.
- Mobile keeps the bottom navigation and safe-area behavior; desktop keeps a scrollable role-aware sidebar.
- No business rules, role gates or financial confidentiality rules may be weakened by visual redesign.


## UX/UI V3 design lock — 2026-10-04
- The previous "Infinity Corporate Workbench" refresh remains rejected.
- The user explicitly approved the V3 visual board and the orange/black Infinity brand logo on 2026-10-04.
- V3 Foundation and Screen Map are now LOCKED and implementation is authorized.
- Controlling visual direction: exact Infinity logo colors, charcoal sidebar, warm-white canvas, orange primary actions, compact enterprise density, approved Home/forms/approval/project/report/admin/finance/mobile compositions.
- Business logic, approval invariants, financial confidentiality and responsive requirements remain unchanged.

## Request flow refinements — 2026-10-04
- Project selection uses type-ahead search instead of a long dropdown. Search covers Project/PO, customer, project name/code, Product Category and Product Solution from Project Master.
- Mileage address entry keeps Google Places autocomplete and now requests up to three transient Google Routes alternatives. The employee can select a route; the selected distance is copied into the attested mileage field. Route geometry remains no-store and is not durable financial evidence.
- The route selector shows the selected Google Routes geometry over a real transient Google Maps road-map background, refreshes the map when the employee selects an alternative route, and provides an explicit link to open the origin/destination in Google Maps. The image and geometry are no-store UI assistance.
- Mileage, Taxi and Grab may include Toll as an add-on in the same travel entry. Toll has its own amount and receipt evidence in the UI, while Finance/reporting receives it as a separate Toll calculation line.


## Approval flow refinement — 2026-10-04
- Reporting Line Head is always the first approval stage for employee requests; request-class configuration never bypasses the Reporting Line.
- Annual leave, sick leave and other leave can optionally name a specific Final Approver after the Reporting Line stage.
- OT, travel/transport expense, other expense, mixed expense, Trip and Cash Advance can optionally name a Finance Payer as Final Approver; the payer is configured independently per class.
- Finance Payer final approval is segregated from Finance Verify and from the requester. Payment confirmation remains restricted to the configured Finance Payer when one is assigned.


## UX/UI V4 locked compact enterprise — 2026-10-04
- V4 visual direction is LOCKED from the user-provided reference images and supersedes V3 styling only.
- Forms use compact 36–40px desktop controls, 16–18px checkboxes, balanced field widths and restrained textarea heights.
- Admin Calendar/Holiday, Employee role controls, Profile Home Address/Commute and Approval Delegation must follow compact enterprise proportions.
- Desktop Approval Delegation keeps Delegate + From + To + Action on one aligned row when space permits.
- Oversized blank form surfaces, giant checkmarks and wrapped desktop actions are rejected by the V4 acceptance gate.
- Full detail is in UX_UI_V4_LOCKED.md.

<!-- agent-gateway:managed:start:ux-ui-v5-locked-reference-20261004 -->
## UX/UI V5 locked reference — 2026-10-04
- V5 visual direction is LOCKED from the user-provided Employee System home reference and supersedes the charcoal-sidebar V3/V4 shell styling.
- Desktop sidebar is white with a subtle divider, clean Infinity orange/navy logo lockup, muted group labels, and pale-orange active navigation.
- Main canvas is warm white/light neutral; working surfaces are white with thin neutral borders and restrained elevation.
- Topbar remains white with compact search, notification and account controls.
- Admin subnavigation uses a white strip with pale-orange active tab.
- Department editor desktop action order is Save → Delete on the same row when space permits.
- Approval Rules desktop action order keeps Effective Date → “ใช้ค่านี้” on the same row when space permits.
- Mobile may stack actions for usability; 390/820/1440 remain required responsive acceptance widths.
- Business rules, authorization, approval invariants, finance segregation, audit behavior and confidentiality are unchanged.
- Detailed controlling spec: `UX_UI_V5_LOCKED.md`.
<!-- agent-gateway:managed:end:ux-ui-v5-locked-reference-20261004 -->

<!-- agent-gateway:managed:start:finance-command-center-v5-20261005 -->
## Finance Command Center V5 — 2026-10-05
- User approved implementation of the Finance UX restructuring shown in the 2026-10-05 proposal.
- Finance landing page prioritizes four primary tasks in workflow order: ตรวจสอบรายการ → จัดชุดการจ่ายเงิน → OT / Payroll (EASY-ACC) → Accounting Export (Smartbiz).
- Primary cards use only authoritative current counts already returned by Finance Overview; no invented metrics are shown.
- The Finance queue remains the working center for verification. Verified items continue to Payment Batches under the existing finance workflow.
- Settlement, original receipts, Project P&L, reconciliation, monthly closing and operations are grouped under a compact secondary tools area.
- Existing role gate remains Finance-only. Finance conflict-of-interest protections remain unchanged: own items are read-only and cannot be verified or paid by the same actor.
- EASY-ACC and Smartbiz remain fail-closed until their approved integration contracts/bridges are ready; this UX change does not bypass readiness gates.
- Responsive acceptance remains 390/820/1440 and uses the locked V5 white-sidebar / warm-neutral / Infinity-orange visual foundation.
<!-- agent-gateway:managed:end:finance-command-center-v5-20261005 -->

<!-- agent-gateway:managed:start:request-experience-v5-map-controls-20261005 -->
## Request Experience V5 + Google Map controls — 2026-10-05
- User approved applying the Request UX mockup direction to the live Employee System.
- /requests now uses compact status-summary cards for Draft, Waiting Approval, Returned, Approved and Paid; request type is shown with semantic icon/color while the underlying request state machine remains unchanged.
- /requests/new now uses icon-led semantic request-type cards for Leave, OT, Expense/Mileage, Business Trip and Cash Advance, plus a clear entry to Outlook Calendar worklog review.
- Each request form shows a compact type banner with the same semantic color/icon language. Business rules, approval routing, evidence rules and security remain unchanged.
- Mileage Google Maps preview is compact by default instead of consuming the full form width/height. The user can zoom the rendered map image from 70% to 200% with − / + controls and can expand/collapse the map frame.
- Map zoom/frame controls are client-side presentation only and do not create additional Google Maps API calls or change the selected route/distance evidence.
- Responsive behavior remains required at 390/820/1440 widths and stays within the locked V5 white-sidebar / warm-neutral visual system.
<!-- agent-gateway:managed:end:request-experience-v5-map-controls-20261005 -->
