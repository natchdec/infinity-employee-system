# UX/UI Locked Specification V1

Status: CANDIDATE pending recorded image inspection and Taste/Astra review. Revision: 2026-09-23. Complete screen inventory and route contracts are in docs/SCREEN_CONTRACTS_V1.md and are part of this specification. Component rules are in UX_COMPONENT_SYSTEM_V1.md. Design lock, implemented functionality and production acceptance are separate gates.

## Authority

Preserve PROJECT.md, SOT.md, DECISIONS.md and the owner's V1 mission, with documented corrections in UX_REVIEW_V1.md. Astra owns product workflow, security and enterprise usability; design-taste-frontend challenges visual quality only. No marketing layout rule overrides a working finance table, mobile form or accessibility requirement.

The direction is Quiet Enterprise / Modern Editorial: warm neutral canvas, white working surfaces, charcoal Thai typography and restrained Infinity blue. No neon, glass, glow, generic SaaS dashboard decoration, oversized empty KPI cards or fake AI widget. All sample data must be labeled synthetic and excluded from production.

## IA and responsive shell

Employee: Home, My Requests, New Request, Trips, Profile. New Request offers Leave, OT, Expense and Trip; Entertainment remains an Expense subtype. Head adds Approval Inbox/History. Finance adds Work Queue, Claims, Original Receipts, Advances, Settlements, Payment Batches, Payroll OT/Cycles, Accounting Exports and Reports. Admin adds Employees, Organization, Policy Families, Expense Types, Holidays, Approval Rules, Project Integration, Audit and System Settings.

Work modes change navigation, not identity or authorization. Hide inaccessible destinations. Contextually prohibited actions, particularly own-claim Finance actions, show a clear explanation rather than an unexplained missing button. Server authorization remains authoritative.

Desktop: 224px navigation, 64px context bar, 24-32px gutters. Employee forms max 760px; finance uses available working width. Tablet 820px: condensed navigation, readable single-column forms and locally scrolling tables. Mobile 390px: 16px gutters, stacked sections and five-destination bottom navigation with safe-area padding. Table overflow stays inside its region, never on the document. Avoid a giant dashboard header; place useful actions and work near the top.

## Global screen/state contract

Every screen in the inventory implements loading, empty, no-filter-match, permission denied, validation, network error/retry, offline and success states relevant to its role. Skeletons resemble the final layout, never fabricate values. Empty state explains the next valid action. Validation preserves current safe input, links errors to controls and focuses the first invalid field. A success state uses the actual server reference/result and next responsible role, never a canned success string after a failed request.

Thai is primary. Dates are stored as ISO full-day dates and shown with clear Thai month/year representation. Business instants use Asia/Bangkok regardless of device timezone. Amounts show currency and two decimal places, right aligned with tabular numerals. Do not abbreviate working money into k/m values. Raw UUIDs remain in diagnostics rather than normal employee UI.

All mutations use expected revision plus stable per-intent idempotency key. Duplicate taps cannot create extra requests/payments/exports. A stale revision displays an actionable reload conflict; changed payload under the same key is not an update. Pending is not completed. A timeout after a financial action requires status retrieval before replay.

Draft save state is explicit: saving, saved, failed/unsaved. Do not claim local input is saved on the server. Save Draft is always available. Unsaved navigation warns the user; returning to edit preserves current input. Offline disables submit/approve/pay and offers reconnection. No private HR, receipt, salary or finance response is stored in service-worker caches. No silent queued financial submission.

Lists retain filter/search state in the URL, provide Clear Filters and distinguish empty from no matches. Totals reflect the current filtered selection and currency. Selection never silently spans all pages. Bulk confirmation names the exact count/amount and ineligible items; the server revalidates every item. Use semantic tables with visible headers and a details route on narrow screens.

## Employee workflow contracts

Leave: type, full-day start/end, counted units, entitlement versus paid cap, before/after balance, reason and type-specific evidence. No half-day/hour control. Count working or calendar days according to the applicable version. Overlap and policy-boundary errors are actionable. Sick paid-cap exhaustion is not a denial of sick-leave entitlement. Unknown grant/hire data says configuration/review required, not zero entitlement.

OT: work date, project/task, work description and policy-generated integer-hour category rows. No start/end-time/minute fields and no employee-entered payout. Preview displays calculated amount and expected payroll cycle; server recalculates at submit. Legal OT eligibility is independent of Head/Owner role. Missing wage/eligibility, fractional hours, inappropriate day category and exceeded policy limits are explicit errors. Line Head only, never Project Manager.

Expense: common date/project/description plus category-dependent fields. Taxi meter evidence, Grab/toll/parking/hotel/rental receipts follow policy. Entertainment adds business purpose, customer/organization and attendees. Camera/file picker has progress, filename/type/size, retry and error states. Do not mark failed/quarantined upload as available evidence.

Mileage: one row per leg with HOME/OFFICE/CUSTOMER/OTHER endpoints, distance source, gross distance, commute deduction, eligible distance, rate and amount. Deduct normal commute independently on eligible home legs, clamp each to zero, never deduct it from office legs. Preserve saved snapshot. Manual attestation is visibly not Google verification; provider configuration/retention failure is not silently hidden. Do not expose precise home locations in ordinary review lists.

Trip: parent transaction with project, destination, domestic/international, dates, purpose, per-diem preview, linked expenses, advance and settlement. Unspecified rates block the affected calculation with an Admin action rather than showing a zero entitlement. Estimates are labeled estimates. Requested advance is not received cash. Expense links retain parent ownership and project context.

Settlement: show paid advances, approved eligible actuals/per diem, pending/excluded lines, due date and employee refund or company top-up. Deadline is trip-end + 3 calendar days with no silent weekend extension. Pending actuals block final settlement or require an explicit exclusion/correction path. Refund and top-up have different labels. Settled requires independently confirmed cash reconciliation, not merely uploaded proof.

My Requests/detail: compact reference, subject, date, units/amount, next responsible role and independent state dimensions. Submitted rounds and policy/calculation history are immutable. Returned requests show the reason, permit a new corrected round and keep prior actions visible. Paid/exported financial values are read-only; correction uses a linked audited adjustment, never a generic Edit button.

## Head/Owner workflow

Inbox includes assigned active requests, oldest unresolved first, with applicant/type/date/units and exceptions. Detail prioritizes business context, calculation/evidence and policy before history. Approve, Return and Reject are distinct. Return/reject require a reason; approve confirms the exact round/revision. Return means resubmittable, reject is terminal for that round. Stale decisions return conflict.

Owner/Head self-request displays a system managerial skip with the applied policy, never a self-signature. Financial requests still enter independent Finance verification. Head history is read-only and filterable. Sticky mobile actions leave room for content, focus and safe-area insets.

## Finance/Admin workflow

Finance is table-first. Columns separate managerial state, Finance state, digital evidence, original receipt and payment. Paid can coexist with original-outstanding. Claim detail offers verify/return, not in-place editing of claimant values. Own verification/payment is blocked even for Admin. A batch containing an operator-owned item is blocked with the affected item identified.

Payment batches show exact obligations, count, total, method and external reference/evidence. The action records an externally completed transfer/petty-cash payment; label it Record Payment, not Transfer Money. Batch membership freezes at the guarded ready/paid boundary. Confirmation is all-or-nothing and idempotent.

Payroll shows central cutoff/nominal payday, approved integer OT and assigned cycle. Late approval moves forward; exported/closed membership is frozen. Expenses do not enter payroll. Easy-ACC/Smartbiz require a verified supported format. A neutral review CSV is clearly not a vendor import; adapter unavailable remains configuration-required.

Original Receipts queue is independent of paid status. Receive original records actor/date/note without modifying amount. Advances/settlements distinguish requested, paid, due today, overdue and settled. Reports separate actual costs, cash paid and outstanding advances; never count an advance and its actual expenses twice.

Admin maps real Entra identities and dated reporting/wage/commute records. The stated headcount mismatch does not authorize invented people. Policy editing creates a new version, previews examples and chooses an effective date/reason; published versions cannot be silently changed. Holidays are the company calendar, not assumed government-office holidays. Project Integration is read-only source/column mapping with last sync/stale/inactive states, not duplicate Project Master creation. Settings shows exact missing dependencies without displaying secret values. Audit is immutable and permission/redaction aware.

## Accessibility and visual lock

Target WCAG 2.2 AA. Labels above fields, real buttons/links, semantic headings/landmarks/tables, keyboard navigation, visible focus and dialog focus return are required. Status always has text, not color alone. Minimum 44px phone targets, 16px phone inputs, Thai body line-height >=1.55, no Thai letter spacing or clipped tone marks. Reduced motion removes nonessential effects. Test long Thai names, 200% zoom, large amounts, empty/error/offline and conflict states. Sticky UI must not obscure focused controls or last content.

Lock evidence must record actual source hashes, viewport screenshots, automated checks and image inspection, followed by Taste and Astra critiques and corrections. A generated screenshot alone is not a visual review. The prototype is a design instrument, not proof of a working backend. Unreviewed screen families remain explicitly unverified. Material post-lock changes update this contract and repeat affected gates.
