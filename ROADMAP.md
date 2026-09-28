# Roadmap

## Phase 0 - Blueprint, UX and Foundation
- [x] Confirm workflows, roles, policies, architecture, and data model.
- [x] Create Employee Mobile, Head Approval, Finance Desktop, and Admin UX contracts and visual evidence.
- [x] Establish Quiet Enterprise / Modern Editorial component system.
- [x] Build Next.js/PostgreSQL foundation, Entra OIDC boundary, role-aware shell, worker, health/readiness, migrations, and isolated OCI UAT.
- [x] Verify source gates and M0 runtime UAT.
- [x] Complete implemented-app browser/Taste/Astra visual gate across Employee, Head and Finance surfaces.

## Phase 1 - Core V1
- [x] Foundation: App Router, PostgreSQL, migrations, policy engine, audit primitives, worker, runtime UAT.
- [x] Identity/organization foundation and role-aware query boundary.
- [x] Transaction command service and API: submit/resubmit/cancel, Head approve/return/reject, Finance verify/return, idempotency, revision fencing and API CSRF boundary.
- [x] Leave transactional workflow.
- [x] OT and payroll-cycle workflow.
- [x] Expense including Entertainment, mileage and receipt/document flow.
- [x] Business Trip, Per Diem, Cash Advance and settlement.
- [x] Finance verification and original-receipt tracking.
- [x] Petty cash / transfer payment batches.
- [x] Neutral payroll/accounting review exports and fail-closed Easy-ACC/Smartbiz adapter boundaries.
- [x] Responsive browser hardening and implemented-app UAT at 390/820/1440.
- [x] PWA installability/offline-shell hardening with cache-privacy UAT.
- [x] Microsoft Lists/SharePoint live source discovery, 458-row read snapshot, and available lookup mapping.
- [ ] Project Master production sync activation after authoritative Engineer Lead and Cost Center sources are defined.
- [x] Google Routes transient no-store mileage preview boundary with explicit non-evidence semantics.
- [ ] Google Routes durable verified-evidence mode after API credential and contractual retention rights are confirmed.
- [x] Implement and regression-test Easy-ACC PRIMPORT exact row shape and <=9-digit employee code constraint.
- [ ] Enable Easy-ACC production export after employee-code, workday and OT1-OT4 mappings are verified.
- [ ] Verify and enable exact Smartbiz supported export/import format.
- [x] Provision the dedicated Infinity ESXi Linux VM and complete live Docker Compose build/start/restart/persistence/backup verification there.
- [ ] Production Entra identity, S3-compatible object storage, domain/TLS, backup/restore and ESXi production rollout readiness.
- [ ] Explicit cutover approval.

## Phase 1.5 - Monthly Worklog and Operations Automation
- [x] Outlook Calendar sync reads only events explicitly categorized with `IES · ...` and stores minimum claim metadata; no Mail access and no automatic submission.
- [x] Calendar Inbox creates reviewable OT, Onsite mileage and full-day Thai Leave drafts with source event identity, occurrence/change metadata, dedupe and post-submit change detection.
- [x] OT draft calculation uses versioned working schedule/holidays, excludes normal office hours, supports 0.5-hour increments, handles cross-midnight/overlap exceptions, and preserves existing approval/payroll flow.
- [x] Onsite mileage defaults to round trip, distinguishes Online vs Onsite, supports Home commute deduction and multi-stop same-day route review before Google Routes calculation.
- [x] Monthly Review lets each employee confirm/edit/ignore suggested items, then creates existing OT/Expense/Leave requests without bypassing approval.
- [x] Monthly Closing / Payroll Cutoff Center adds Open -> Closing -> Locked periods and prevents silent edits after lock.
- [x] Adjustment workflow records post-lock corrections as linked auditable adjustments instead of rewriting historical paid/exported requests.
- [x] Exception Inbox centralizes overlapping OT, missing locations, invalid leave events, unresolved mileage routes, missing receipts, calendar source changes and configuration gaps.
- [x] Approval Delegation supports effective-dated substitute approvers while preserving no-self-approval and Finance conflict-of-interest rules.
- [x] Notification / Reminder Center covers unreviewed calendar drafts, pending approvals, receipt gaps, settlement deadlines, payroll cutoff and Finance work queues.
- [x] Receipt Inbox supports mobile-first unassigned receipt capture and later attachment to claims, with duplicate-detection boundary.
- [x] Employee Monthly Statement summarizes OT, mileage, expense, advance/settlement, leave and payment status for the period.
- [x] Company Holiday / Working Schedule and unified Policy Center are versioned/effective-dated and feed OT/payroll calculations.
- [x] Human-readable Audit Timeline exposes who did what and when without leaking private payloads.
- [x] Hourly incremental Outlook sync plus manual Sync Now is idempotent and preserves submitted request immutability.

## Phase 2 - Project and Automation Enhancement
- Project cost reporting.
- Teams notifications.
- Operational dashboards and finance reconciliation enhancements.

## Phase 3 - Convenience Integrations
- LINE OA rich menu.
- Deep links into PWA.
- Receipt Inbox via LINE.
- Additional automation around reminders and document intake.
- Advanced reporting and project profitability.
