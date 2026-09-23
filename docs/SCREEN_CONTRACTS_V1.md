# Screen Contracts V1

Part of UX_UI_LOCKED_SPEC_V1.md. All routes inherit shared accessibility, role/object authorization, revision/idempotency, loading/empty/error/offline and responsive rules. A route in this contract is required design scope, not proof that its implementation has passed UAT. E=Employee, H=Head, F=Finance, A=Admin. Viewport families are evaluated at 390/820/1440px.

## Employee/mobile

| ID | Route / screen | Fields/content and action | Special state |
| --- | --- | --- | --- |
| E01 | /sign-in | Company identity, Microsoft sign-in, privacy/support | Missing provider, expired flow, denied/unmapped/inactive identity; no local password |
| E02 | / | Attention list, returned/due items, new shortcuts, recent requests, payroll cutoff | No outstanding work; missing balance/config is not zero |
| E03 | /requests/new | Leave / OT / Expense / Trip chooser | Keyboard/touch selection, no redundant wizard |
| E04 | /leave/new | Type, full-day start/end, count, balance/paid cap, reason/evidence; review and submit | Whole days, overlap, insufficient entitlement, policy/year split |
| E05 | /leave | Year/type balances, history, pending holds | Unknown grant, cancellation/reversal, paid cap separate |
| E06 | /ot/new | Work date, project/task, description, policy category integer hours, amount/cycle preview | No times/minutes/manual payout; eligibility/wage/category error |
| E07 | /expenses/new | Date, type, project, description, amount, evidence, optional Trip | Category-specific requirements; invalid/duplicate evidence |
| E08 | /expenses/new?type=mileage | Per-leg origin/destination class, source, gross/deduction/eligible distance/rate | Missing commute; manual vs provider; clamp per leg |
| E09 | Expense receipt capture | Camera/file picker, file rows, size/type/progress/retry | Permission denied fallback, upload failure, quarantine, corrupt file |
| E10 | /expenses/new?type=entertainment | Expense common fields, purpose, customer, attendees | Required business context; not a separate top-level module |
| E11 | /trips/new | Project, destination, domestic/international, dates, purpose, per-diem/estimates | Unconfigured rate; invalid date range; estimate is not paid |
| E12 | /trips | Planned/active/due/completed list, dates, destination, advance obligation | Due today/overdue distinguished |
| E13 | /trips/[id] | Parent summary, approval, actuals, per diem, advances and settlement | Frozen/settled parent; outstanding advance prevents casual cancellation |
| E14 | /trips/[id]/advance | Amount, purpose, prior requested/paid advances; request | Owned approved Trip required; no new advance after freeze |
| E15 | /trips/[id]/settlement | Approved actuals, paid advances, pending items, net refund/top-up, due date | Pending costs, refund evidence awaiting independent confirmation |
| E16 | /requests | Own requests, search/type/status/date filters | Empty vs no matches; draft/returned distinguishable |
| E17 | /requests/[id] | Summary, lines, status dimensions, evidence, policy/calculation and timeline | Paid/exported immutable; unauthorized non-disclosing not found |
| E18 | /requests/[id]/edit | Returned reason, correction, prior round, resubmit | Stale revision; new review round; no old history deletion |
| E19 | /profile | Corporate identity, department, Head, roles, support, sign-out | No own salary/role/Head edit; missing mapping escalation |
| E20 | Global feedback | Loading, empty, validation, network, offline, success | Actual server outcome; no private cache/financial replay |

## Head/Owner

| ID | Route / screen | Content/action | Special state |
| --- | --- | --- | --- |
| H01 | /approvals | Assigned pending queue, employee/type/date/units/context; filters | No unassigned company-wide access |
| H02 | /approvals/[id] | Business context, amount/units, evidence, policy, timeline | Exact round/revision, stale action conflict |
| H03 | Decision dialog | Approve / Return / Reject, confirmation and reason | Return/reject reason mandatory; no canned successful approval |
| H04 | /approvals/history | Past actions with filters and immutable history | No disguised re-approval action |
| H05 | Owner self-request detail | System managerial skip explanation and policy | Finance remains pending; no self-signature |

## Finance/desktop

| ID | Route / screen | Content/action | Special state |
| --- | --- | --- | --- |
| F01 | /finance | Work queue tabs/counts: verify, ready to pay, originals, due advances | Counts match authorized query/filter |
| F02 | /finance/claims | Search/type/project/date/status filters, selection, dense table | Own claim exclusions; selection not silently all pages |
| F03 | /finance/claims/[id] | Lines, evidence, policy, managerial result, timeline | Return for correction instead of editing claimant values |
| F04 | Verify dialog | Confirm exact round, verify or return with reason | Server and UI prohibit self-verification |
| F05 | /finance/receipts | Original-outstanding queue, received date/receiver/note | Paid may remain outstanding; no amount change |
| F06 | /finance/advances | Requested/approved/paid amounts, Trip end/due/status | Requested is not paid; overdue derived centrally |
| F07 | /finance/settlements | Actual/advance/net reconciliation, approve/return/refund confirmation | No double reimbursement; proof is not confirmation |
| F08 | /finance/payments | Batch references/method/count/total/preparer/status; create | Only eligible verified obligations |
| F09 | /finance/payments/[id] | Frozen obligation list, amount/currency, external reference/history | Own item or stale allocation blocks entire payment |
| F10 | Payment confirmation | External paid date/reference/evidence, exact count/total | Records external payment; does not execute bank transfer |
| F11 | /finance/payroll | Approved OT by target cycle, policy/cutoff, exceptions | No expenses; sensitive wage basis restricted |
| F12 | /finance/payroll/[cycle] | Nominal payday, exclusive cutoff, items/totals/state | Closed/exported membership frozen; late item moves forward |
| F13 | Easy-ACC export | Adapter readiness, verified format, snapshot/artifact/receipt | Unsupported format blocked; neutral CSV clearly different |
| F14 | /finance/accounting | Period/candidate filters, Smartbiz readiness and export history | No invented API/import format; immutable job/input hash |
| F15 | /finance/reports | Project cost/reconciliation, date basis/currency, neutral export | Advances not double-counted as actual cost |
| F16 | Conflict-of-interest | Explain another authorized Finance/Admin actor is required | No Admin override or role-switch bypass |

## Administration

| ID | Route / screen | Content/action | Special state |
| --- | --- | --- | --- |
| A01 | /admin/employees | Entra identity mapping, email, department, hire date, active/roles; controlled edits | Do not synthesize real roster; restricted dated wage/eligibility |
| A02 | /admin/organization | Departments, dated reporting lines, Head assignment | No cycle/self/overlap; preserve historic assignment |
| A03 | /admin/policies | Leave/OT/Mileage/Per Diem/Payroll/Calendar/Receipt/Approval families | Draft vs published/effective clearly distinct |
| A04 | /admin/policies/[family] | View version, new draft, examples, effective date/reason, publish | Statutory floor blocks; immutable published content |
| A05 | /admin/expense-types | Types, evidence requirements, cost mapping | Historical inactive types readable; Entertainment remains subtype |
| A06 | /admin/holidays | Versioned company calendar, observed dates, impact preview | Not automatically government holiday calendar |
| A07 | /admin/approval-rules | Line-Head, Owner system skip, Finance independence | No Project Manager step; no historical reassignment |
| A08 | /admin/integrations/projects | Tenant/site/list/column mapping, source/ETag/last sync, safe retry | Read-only; stale/inactive/missing credentials; no master duplication |
| A09 | /admin/audit | Actor/entity/date/action filters and immutable events | Redact secrets, salary, private medical/home details |
| A10 | /admin/settings | Identity/DB/storage/worker/adapters/backups/readiness | Show configured metadata only, never secret values |

## Shared interaction acceptance

All forms: visible labels, mobile 16px inputs/44px targets, keyboard focus, correct input type and server validation. Review shows applicable policy/calculation and next role before commit. All lists: stable sorting/pagination, URL filters, accurate count/total, readable Thai wrapping and local table scroll. All details: role-aware actions, independent statuses, immutable round/history and explicit correction limitations. All dialogs: titled, focus trapped/restored, Escape cancels without mutation, financial confirmation persists outcome outside a toast. All files: private authorized access, safe MIME/size and scan status. Test with long Thai names, large amounts, narrow viewport and offline/error conditions.
