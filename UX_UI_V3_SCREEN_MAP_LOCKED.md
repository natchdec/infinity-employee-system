# Infinity Employee System — UX/UI V3 Screen Map

**Status:** LOCKED — USER APPROVED  
**Coverage:** all 36 current page routes and their major role/request states.

**Controlling reference:** the user-approved V3 UI board from 2026-10-04. Where an earlier prose bullet differs from the board, the board controls visual hierarchy, orange/charcoal brand treatment, navigation, form stepper style, approval layout, report presentation, and mobile composition.

## A. Access / system

### /sign-in
Narrow 420px access panel. Infinity wordmark, short explanation, Microsoft 365 sign-in CTA, security/support note. No illustration, hero, or gradient.

### /offline
Same access shell. Clear offline explanation, retry action, cached-state note if applicable. Text-first error treatment.

---

## B. Employee workspace

### / — Home
Use the approved V3 employee dashboard composition.
- warm welcome/banner area with greeting and current date/context
- four primary action cards: Leave / OT / Expense / Travel
- lower grid: Outlook calendar, recent/approval status, monthly usage summary
- restrained monthly summary mini-cards are allowed only here because they answer real employee questions
- desktop uses the approved balanced 3-column lower grid
- mobile compresses the same information into stacked sections and compact 2x2 primary actions

### /requests — My Requests
- header + New Request CTA
- filter bar: type/state/month/project/search
- 44px dense rows
- columns: reference, type, title, date, state, amount, latest action
- mobile becomes request rows, not large cards

### /requests/new — Request chooser
860px content width.
Grouped list:
- Time: Leave, OT
- Expense: Expense/Mileage/Entertainment
- Travel: Trip/Cash Advance
Simple bordered rows with description + arrow. No card grid.

### /requests/new?kind=leave
Step structure: Details → Review → Submit.
Leave type, date/range, day count, reason, evidence.
Balance before/after is an inline calculation.
Sticky Save Draft / Submit.

### /requests/new?kind=ot
Date/project first, office-hours policy note, work description, OT categories/multipliers, 0.5-hour increments.
Desktop right summary rail; mobile summary above Submit.

### /requests/new?kind=expense
Flagship form.
Desktop 8/4 split:
- left: compact expense-line editor
- right: Receipt Inbox + selected receipt + running total
Mileage expands route fields under its line.
Google location suggestions look like search results.
Receipt mapping is explicit per line.
Mobile shows one expense line flow with receipt capture under amount/category and sticky total/actions.

### /requests/new?kind=trip
Desktop two-column:
- trip identity: project, destination, domestic/international, dates
- finance preview: per diem, hotel/transport expectation, cash advance
Cash Advance visually subordinate.
Mobile single linear flow.

### /requests/[id] — Request detail
Case-file/document pattern.
Desktop 8/4:
- left: request facts, line details, documents
- right: current status, approval timeline, finance state, actions
Return reason sits beside current state.
Attachments are file rows except receipt previews.
Role-restricted financial content stays separate.

### /requests/[id]/edit
Same architecture as detail but editable.
Return reason pinned near top.
Changed fields marked while editing.
Footer: Cancel / Save Draft / Resubmit.

### /trips
Timeline/list, not generic dashboard.
Upcoming first, completed second.
Destination, project, dates, advance, settlement state.
Overdue settlement is a clear warning line.

### /worklog — Calendar Inbox
Month switcher + filter.
Desktop: compact filter rail + date/time ledger.
Rows show Outlook title, detected type, project/location, draft state.
Conflicts expand inline.
Summary is a sentence ("18 รายการ · 3 ต้องตรวจ"), not KPI cards.
Mobile uses date-grouped agenda.

### /receipts — Receipt Inbox
Upload is an action, not a permanent oversized dropzone.
Toolbar: Upload / filter / search.
Image receipts may use a restrained 3-column grid; PDF/document receipts use rows.
Assignment opens right drawer.
Mobile: thumbnail left + metadata right.

### /notifications
Inbox pattern grouped Today / Earlier.
Unread = weight + left accent.
No filled card for every notification.
Mark all read in header.

### /exceptions — Needs Attention
Task list sorted blocking first.
Severity, subject, reason blocked, owner, due.
Resolved hidden by default.
No KPI dashboard.

### /statement — Monthly Statement
Employee ledger.
Month selector, one-line summary, sections for OT / Expense-Mileage / Leave / Travel-Advance-Settlement.
Rows + subtotals.
Print-friendly. No salary exposure.

### /audit
Vertical event timeline.
Filter date/type.
Human action first; technical metadata collapsible.
Redacted data visibly redacted.

### /profile
Desktop two-column:
- left: Microsoft/employee identity, read-only
- right: settings
Home address + commute baseline is a dedicated clear section.
Department/role/reporting remain read-only.

### /projects — Project Master
Search + filters + dense table.
PO grouping visible as expandable parent with -1/-2/-3 child rows.
Columns: PO/Project, name, customer, sales owner, date range, status.
No revenue/cost for ordinary employees.
Mobile uses expandable rows.

### /projects/[id]
Operational facts first.
Grouped PO lines + source freshness.
Employee/Head sees no financial data.
Finance/Admin gets a clearly separated restricted Financial section; it is not blended into the default header.

---

## C. Head / Owner

### /approvals
Approval inbox ordered by waiting time.
Employee, type, date, project, amount, waiting duration.
Delegation is secondary drawer/panel, not part of primary queue.
Mobile opens detail; no approve-from-list shortcut.

### Approval detail
Uses Request Detail architecture.
Decision rail: Approve / Return / Reject.
Return/reject requires reason.
Head/Owner own request never exposes self-approve.

---

## D. Finance

### /finance — Overview
No tile menu.
Top operational sentence/strip for pending verification, ready to pay, originals, advances.
Main 2/3 queue + 1/3 exceptions/closing/shortcuts.
Shortcuts are grouped text links.
Self-owned claims show lock + reason.

### /finance/payments
Batch ledger.
Header: New Batch / Export / Record Result.
Dense payment-item rows.
Batch lifecycle visually linear, not card-based.

### /finance/settlements
Overdue first.
Columns: Employee, Trip, Advance, Actual, Difference, Due, State.
Refund vs Top-up explicit.
Detail via drawer/page.

### /finance/receipts
Physical original tracking table.
Claim, Employee, Digital receipt, Original due/received, Receiver.
Receive Original is primary row action.

### /finance/payroll
Cycle selector + cutoff/state header.
Employee OT rows.
Late approval routing shown inline.
No large KPI cards.

### /finance/reconciliation
Exception-first.
Compact status bar only.
Integrity checks grouped Blocking / Review / Clean.
Table: source, mismatch, expected, actual, next action.
Clean state is simple text confirmation.

### /finance/projects — Project P&L
Financial analytical table.
Filter project/customer/sales/status.
Columns: Revenue, Planned Cost, Actual Cost, Margin, Pending Exposure.
Expandable breakdown + totals footer.
Negative margin uses semantic emphasis only.

### /finance/projects/[id]
Project identity header.
One horizontal financial ledger, then sections/tabs:
1. Revenue & Planned Cost
2. Actual Employee Cost
3. Pending Exposure
4. Activity
Use breakdown tables, not metric cards.
PO child lines visible.

### /finance/operations
Only page allowed to feel dashboard-like because monitoring is its purpose.
Compact queue/worker/exception health, background jobs, 7-day job activity table.
Charts only if they answer an operational question.

### /finance/monthly-close
Period selector + explicit state machine.
Checklist layout.
Blocking items deep-link to queues.
Lock Period requires deliberate confirmation.
Historical periods read-only.

### /finance/exports
Brief export-policy explanation.
Primary export CTA.
Export history ledger: generated by, time, scope, reference/hash, status.
Review CSV and EASY-ACC/Smartbiz direct bridge states shown separately.

---

## E. Admin

### /admin — Overview
No card menu.
Left: setup/readiness checklist.
Right: organization summary as definition rows.
Below: text navigation grouped Identity / Organization / Policy / Integration.
Only actionable issues shown.

### /admin/employees
Search + department + status + role filters.
Dense employee table.
Edit in right drawer.
Roles as explicit controls with explanation.
Delete/deactivate clearly separated.

### /admin/directory
Sync status bar + Sync Now.
Filters: mapped / unmapped / ignored / disabled.
Main Microsoft account ↔ Employee mapping table.
No automatic access grant.

### /admin/organization
Desktop split:
- left: Department list + create/delete
- right: selected department members + reporting lines
Use hierarchy/table, not bubble org-chart.
Effective date visible.
Mobile selects department first.

### /admin/policies
Policy family list left.
Current selected policy right.
Version history below.
Publish New Version opens editor.
Effective date prominent; history immutable.

### /admin/approval-rules
Readable rule matrix.
Rows = request types.
Columns = employee path / head-owner / finance / payer / payroll.
Explain special cases below rows.
No node graph.

### /admin/integrations/projects
Source identity, connection state, last sync/freshness, counts, missing authoritative fields, sync history, Sync Now.
Error detail expandable.
No generic health-card grid.

---

## F. Shared page states

Every screen must explicitly design:
- loading
- empty
- error
- permission denied
- stale/partial integration
- validation error
- success confirmation
- mobile overflow
- keyboard focus

## G. Lock checklist

All items below must be reviewed before implementation:
- shell/navigation
- Home
- Requests list
- request chooser
- Leave
- OT
- Expense/Mileage
- Trip
- Request detail/edit
- Calendar Inbox
- Receipt Inbox
- Notifications
- Needs Attention
- Monthly Statement
- Audit
- Profile/Home Address
- Project list/detail
- Approval inbox/detail
- all 11 Finance screens
- all 7 Admin screens
- Sign-in/Offline
- shared states
- 390 / 820 / 1440 behavior

This screen map is LOCKED by explicit user approval on 2026-10-04. Implementation may proceed against this revision.
