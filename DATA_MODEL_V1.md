# Data Model V1

Revision 2026-09-23. PostgreSQL is authoritative; SQL migrations define the physical schema. UUID keys, timestamptz instants, ISO date business days, bigint satang and integer metres. JSON contains bounded typed snapshots, never receipt binaries. The model below is the target contract, not evidence that every table/route is already implemented.

## Organization and identity

Department(id, code, name, active); Employee(id, tenant_id, entra_object_id, normalized email, display_name, department_id, hire_date, active, is_head_owner). Unique tenant/object identity; no passwords. Role/Permission uses canonical Employee/Head/Finance/Admin roles and explicit permission mapping, with employee_roles. Head ownership is not legal OT eligibility.

ReportingLine(employee_id, head_id, effective_from/to) forbids self-reporting, cycles and overlapping applicable Heads. WageVersion(employee, effective_from, monthly_satang, normal_hours_per_day, ot_eligibility) is restricted and versioned. Unknown eligibility/wage blocks OT. CommuteVersion(employee, effective_from, distance_metres, verified_by) stores the normal commute distance without broadly exposing a home address. Historical requests preserve these versions.

AuthFlow stores short-lived state/nonce/PKCE server-side. Session stores only the opaque session token hash, employee, expiry and revocation. No production impersonation/test-login endpoint. UAT identities and sessions exist only in an isolated synthetic database.

## Policies and projects

PolicyVersion(id, family, version, effective_from, typed body, body_hash, legal_references, status, revision, creator/time). Unique family/version and published effective boundary. Draft is revision-guarded; published content is immutable. Latest applicable published version is selected by the transaction's business date; prior referenced versions never rerate.

LeavePolicy, OTPolicy, MileagePolicy, PerDiemPolicy, PayrollPolicy, ApprovalPolicy, ReceiptPolicy and CalendarPolicy are typed PolicyVersion subtypes, not duplicate independent stores. Calendar includes working weekdays and company Holiday dates. Leave distinguishes entitlement, paid cap, period/event and counting basis. OT has stable category IDs and rational multipliers. Unspecified per-diem production rates remain unconfigured.

ProjectReference(id, source tenant/site/list/item IDs, code/name/customer, Sales owner, Engineer lead, start/end, status, cost_center, ETag, last_synced_at). Unique source identity. Read-only projection of Microsoft master; no local authoritative creation. A request retains the source representation used at submission.

## Shared request and approval aggregate

Request(id, reference, kind, employee_id, project_reference_id, parent_trip_id, draft_payload, revision, submission_round, workflow_state, finance_state, payment_state, currency, total_satang, created/updated_at). Kinds: leave, ot, expense, trip, advance. `revision` is the optimistic concurrency clock; `submission_round` identifies immutable submitted content.

RequestRevision(request_id, round, input snapshot, policy IDs/hashes/snapshots, project snapshot, calculated units/amounts, assigned Head, submitted_at) is append-only. Operational state can change without overwriting the submitted round. Draft/returned payload is editable; resubmission creates another round.

Approval(request/round, assignee, status, policy) and ApprovalAction(actor, action, reason, time, request/round) retain history. Owner/Head self-submission records SYSTEM_SKIPPED, not self-approval. Workflow: draft -> pending_head -> approved; pending_head -> returned/rejected; returned -> new pending round; eligible cancellation is explicit. Financial requests independently enter finance pending -> verified/returned. Payment state is independent. Planning Trips and leave are not automatically payable.

## Leave

LeaveRequest(request/round, type, start/end, counted days, paid_days/pay_rate, period/event, policy). Integer full days only. Maternity event limits are distinct from annual balances; sick paid-cap exhaustion does not deny sick entitlement.

LeaveBalance is a projection of immutable LeaveLedger grants/debits/reversals and active reservations. Ledger stores employee/type/period/event, signed units, source round, reason and unique event key. LeaveReservation(employee/date/request, active state) protects pending/approved overlaps. Submission and approval lock the employee balance boundary. Cancellation appends reversal and releases operational reservations, not deleted history. Unsupported cross-year/policy allocation returns an explicit split request instruction.

## OT and payroll

OTRequest detail references work date, project/task, description, wage/policy version and amount. OTLine(request/round/line, category_id, integer hours, multiplier, calculated_satang). No minute or start/end-time fields. Validate effective eligibility and daily/category/weekly limits.

PayrollCycle(month key, nominal payday, exclusive cutoff, calendar/policy snapshot, state open/exported/closed, revision). PayrollItem(request/round, employee, frozen amount, cycle, state), uniquely allocated per accepted OT request. Central Bangkok cutoff and approval time determine cycle. Late approval moves forward; closed/exported membership cannot be silently edited. Expenses never enter this queue.

## Expense, mileage and documents

ExpenseClaim uses Request plus ExpenseLine(request/round/line, date, category, description, project, amount, evidence references). EntertainmentDetail adds business purpose, customer/organization, attendee count/context; it remains an Expense subtype.

MileageDetail/MileageLeg records origin/destination class and privacy-safe labels, source/attestation, gross_metres, commute snapshot, deduction_metres, eligible_metres, rate_satang_per_km, calculated_satang, timestamp/version and legally retainable provider metadata. Deduct commute independently on eligible home legs and clamp each to zero. Do not deduct it from office legs. Provider retention rights are not assumed.

Document(id, owner/uploader, immutable opaque storage_key, safe filename, MIME, bytes, SHA256, evidence class, scan state, uploaded_at, revision). DocumentLink binds an authorized request/round or settlement. No binaries in PostgreSQL. OriginalReceipt independently stores not_required/outstanding/received, receiver/date/note and audit. Digital evidence and original-paper state are not interchangeable; paid can remain original-outstanding.

## Trip, advance, settlement

Trip detail contains destination, domestic/international, dates, purpose, currency, PerDiem policy/rate/days/total and estimates. Estimates are not actual reimbursements. Derived lifecycle: planned/active/settlement_due/due_today/overdue/settled.

CashAdvance is a child request of an owned approved Trip, with requested amount/purpose. Paid advance comes from confirmed payments, not requested amounts. After settlement freeze, new actuals/advances need an explicit adjustment path.

Settlement(id, trip, owner, revision, state, actual_satang, paid_advance_satang, signed net_satang, frozen snapshot, due_date, Finance actor/time, refund proof/reference/confirmation). SettlementItem/Allocation uniquely allocates actuals/per diem and paid advances. One non-void final settlement per Trip. An unpaid/unconfirmed settlement may be voided through an audited operation, preserving history and releasing only active allocation.

Net = eligible approved actuals/per diem - paid advances. Positive creates only a company top-up obligation; negative requires employee return and independent Finance confirmation; zero can settle after verification. Individual Trip actuals cannot be paid again outside their settlement. Advance principal is cash movement, not an additional expense cost.

## Finance

PayableObligation(id, owner, source kind/id/round, amount_satang, currency, verified_by, state unpaid/allocated/paid/void, snapshot). Unique source allocation; verifier cannot be owner. Paid amount/currency/source are immutable.

PaymentBatch(id, reference, method petty_cash/transfer, revision, state ready/paid/void, preparer, payer/time, external reference). PaymentItem binds batch to obligation with unique active allocation. Mark paid locks/revalidates every item and blocks the whole transaction for any operator-owned, stale, void or already-paid obligation. It is idempotent and records external payment, not bank execution.

Paid/exported corrections use linked Adjustment intent with reason, approval and new cash/export treatment. An unimplemented adjustment path remains unavailable/read-only, never an in-place edit of history.

## Jobs, export, audit

ExportJob(id, adapter, scope, input snapshot/hash, idempotency key, status, artifact key/hash, actor/times). Neutral review CSV is distinct from Easy-ACC/Smartbiz. Unsupported vendor format is blocked. Same key with changed content is conflict. Finalized payroll/accounting membership is frozen.

IntegrationJob/Job(id, type, dedupe key, bounded payload, state queued/running/succeeded/failed/blocked, attempts, available_at, locked_by/until, safe error/result). Use FOR UPDATE SKIP LOCKED; visibility expiry may replay only idempotent work. RuntimeHeartbeat exposes worker liveness. Notification(employee, kind, unique event key, safe text/link, created/read time) is recipient-controlled and excludes sensitive medical/salary payloads.

AuditEvent is append-only: timestamp, actor, action, entity, revision/round, correlation ID, redacted metadata. Database guards reject update/delete. CommandReceipt has unique principal/scope/key, canonical input hash and committed result in the same transaction as the mutation. Identical retry returns the receipt; changed input gets 409; rollback cannot leave a false completed receipt.

## Database acceptance

Foreign keys, integer/nonnegative checks, allocation uniqueness and immutable-history guards supplement service validation. Verify real PostgreSQL clean/repeat migrations, constraints, concurrent duplicate commands, persistence and restart. In-memory mocks are not migration/runtime evidence. The implementation report must name any deferred entity/path instead of implying completion from this document.
