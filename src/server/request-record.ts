import { invariant } from '../domain/core';
import type { RequestRecord } from '../domain/requests';
import type { Transaction } from './db';
import { enqueueEmployeeNotice, enqueueRoleNotices } from './notification-queue';

export type CommandResult = {
  id: string;
  reference: string;
  revision: number;
  round: number;
  workflowState: string;
  financeState: string;
  paymentState: string;
  finalApprovalState: string;
  totalSatang: string;
};

export type ApprovalHistoryAction =
  | 'submitted'
  | 'system_skipped'
  | 'approved'
  | 'returned'
  | 'rejected'
  | 'cancelled'
  | 'finance_verified'
  | 'finance_returned'
  | 'final_approved'
  | 'final_returned'
  | 'final_rejected';

export function historyAction(
  action:
    | 'submit'
    | 'approve'
    | 'return'
    | 'reject'
    | 'cancel'
    | 'finance_verify'
    | 'finance_return'
    | 'final_approve'
    | 'final_return'
    | 'final_reject',
): ApprovalHistoryAction {
  const actions = {
    submit: 'submitted',
    approve: 'approved',
    return: 'returned',
    reject: 'rejected',
    cancel: 'cancelled',
    finance_verify: 'finance_verified',
    finance_return: 'finance_returned',
    final_approve: 'final_approved',
    final_return: 'final_returned',
    final_reject: 'final_rejected',
  } as const;
  return actions[action];
}

export function financialKind(kind: RequestRecord['kind']): boolean {
  return kind === 'expense' || kind === 'advance';
}

export function financeAfterManager(
  kind: RequestRecord['kind'],
  workflowState: string,
): RequestRecord['finance_state'] {
  return financialKind(kind) && workflowState === 'approved' ? 'pending' : 'not_required';
}

export function requestFromRow(row: Record<string, unknown>): RequestRecord {
  return {
    id: String(row.id),
    reference: String(row.reference),
    kind: row.kind as RequestRecord['kind'],
    employee_id: String(row.employee_id),
    project_reference_id: row.project_reference_id ? String(row.project_reference_id) : null,
    parent_trip_id: row.parent_trip_id ? String(row.parent_trip_id) : null,
    title: String(row.title),
    business_date: String(row.business_date),
    draft_payload: (row.draft_payload ?? {}) as Record<string, unknown>,
    revision: Number(row.revision),
    submission_round: Number(row.submission_round),
    workflow_state: row.workflow_state as RequestRecord['workflow_state'],
    finance_state: row.finance_state as RequestRecord['finance_state'],
    payment_state: row.payment_state as RequestRecord['payment_state'],
    total_satang: String(row.total_satang),
    currency: String(row.currency),
    assigned_head_id: row.assigned_head_id ? String(row.assigned_head_id) : null,
    assigned_final_approver_id: row.assigned_final_approver_id
      ? String(row.assigned_final_approver_id)
      : null,
    final_approval_state: (row.final_approval_state ??
      'not_required') as RequestRecord['final_approval_state'],
    approval_route_key: row.approval_route_key ? String(row.approval_route_key) : null,
    approval_route_version_id: row.approval_route_version_id
      ? String(row.approval_route_version_id)
      : null,
    created_at: new Date(String(row.created_at)),
    updated_at: new Date(String(row.updated_at)),
  };
}

export async function requestForUpdate(tx: Transaction, id: string): Promise<RequestRecord> {
  const [row] = await tx`
    select
      id,
      reference,
      kind,
      employee_id,
      project_reference_id,
      parent_trip_id,
      title,
      business_date::text,
      draft_payload,
      revision,
      submission_round,
      workflow_state,
      finance_state,
      payment_state,
      total_satang::text,
      currency,
      assigned_head_id,
      assigned_final_approver_id,
      final_approval_state,
      approval_route_key,
      approval_route_version_id,
      created_at,
      updated_at
    from requests
    where id = ${id}
    for update
  `;
  invariant(row, 'NOT_FOUND', 'ไม่พบรายการ', 404);
  return requestFromRow(row as Record<string, unknown>);
}

export function resultOf(request: RequestRecord): CommandResult {
  return {
    id: request.id,
    reference: request.reference,
    revision: request.revision,
    round: request.submission_round,
    workflowState: request.workflow_state,
    financeState: request.finance_state,
    paymentState: request.payment_state,
    finalApprovalState: request.final_approval_state,
    totalSatang: request.total_satang,
  };
}

export async function notifyHead(
  tx: Transaction,
  request: RequestRecord,
  headId: string | null,
): Promise<void> {
  if (!headId || request.workflow_state !== 'pending_head') return;
  await enqueueEmployeeNotice(tx, `${request.id}:${request.submission_round}:head_pending`, {
    employeeId: headId,
    title: `มีคำขอรออนุมัติ ${request.reference}`,
    detail: `${request.title} · กรุณาตรวจสอบและเลือก Approve / Return / Reject`,
    href: `/requests/${request.id}`,
  });
}

export async function notifyFinalApprover(tx: Transaction, request: RequestRecord): Promise<void> {
  if (!request.assigned_final_approver_id || request.final_approval_state !== 'pending') return;
  await enqueueEmployeeNotice(tx, `${request.id}:${request.submission_round}:final_pending`, {
    employeeId: request.assigned_final_approver_id,
    title: `มีคำขอรอ Final Approval ${request.reference}`,
    detail: `${request.title} · ผ่าน Reporting Line แล้ว กรุณาตรวจสอบขั้นสุดท้าย`,
    href: `/requests/${request.id}`,
  });
}

export async function notifyFinancePending(tx: Transaction, request: RequestRecord): Promise<void> {
  if (!financialKind(request.kind)) return;
  if (request.workflow_state !== 'approved' || request.finance_state !== 'pending') return;
  await enqueueRoleNotices(
    tx,
    'finance',
    `${request.id}:${request.submission_round}:finance_pending`,
    {
      title: `มีรายการรอ Finance Verify ${request.reference}`,
      detail: `${request.title} · ตรวจสอบเอกสารและยอดก่อนส่งต่อขั้นจ่ายเงิน`,
      href: `/requests/${request.id}`,
    },
    [request.employee_id],
  );
}

export async function notifyFinancePayers(
  tx: Transaction,
  request: RequestRecord,
  excludeEmployeeIds: readonly string[] = [],
): Promise<void> {
  if (!financialKind(request.kind)) return;
  if (request.finance_state !== 'verified' || request.payment_state !== 'unpaid') return;
  const eventKey = `${request.id}:${request.submission_round}:payment_pending`;
  const notice = {
    title: `มีรายการพร้อมจ่าย ${request.reference}`,
    detail: `${request.title} · Finance Verify และ Final Approval ครบแล้ว กรุณาจัดชุดจ่ายและยืนยัน Paid`,
    href: '/finance/payments',
  };
  if (
    request.assigned_final_approver_id &&
    !excludeEmployeeIds.includes(request.assigned_final_approver_id)
  ) {
    await enqueueEmployeeNotice(tx, eventKey, {
      employeeId: request.assigned_final_approver_id,
      ...notice,
    });
    return;
  }
  await enqueueRoleNotices(tx, 'finance_payer', eventKey, notice, [
    request.employee_id,
    ...excludeEmployeeIds,
  ]);
}
