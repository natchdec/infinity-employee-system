import { invariant, type Json } from '../domain/core';
import type { RequestRecord } from '../domain/requests';
import { enqueue, type Transaction } from './db';

export type CommandResult = {
  id: string;
  reference: string;
  revision: number;
  round: number;
  workflowState: string;
  financeState: string;
  paymentState: string;
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
  | 'finance_returned';

export function historyAction(
  action:
    'submit' | 'approve' | 'return' | 'reject' | 'cancel' | 'finance_verify' | 'finance_return',
): ApprovalHistoryAction {
  const actions = {
    submit: 'submitted',
    approve: 'approved',
    return: 'returned',
    reject: 'rejected',
    cancel: 'cancelled',
    finance_verify: 'finance_verified',
    finance_return: 'finance_returned',
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
    totalSatang: request.total_satang,
  };
}

export async function notifyHead(
  tx: Transaction,
  request: RequestRecord,
  headId: string | null,
): Promise<void> {
  if (!headId || request.workflow_state !== 'pending_head') return;
  await enqueue(
    tx,
    'in_app_notification',
    `${request.id}:${request.submission_round}:head_pending`,
    {
      employeeId: headId,
      title: `มีคำขอรออนุมัติ ${request.reference}`,
      href: `/approvals/${request.id}`,
    } satisfies Json,
  );
}
