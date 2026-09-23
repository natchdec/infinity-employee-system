import { randomUUID } from 'node:crypto';
import {
  invariant,
  requireIndependentFinance,
  requireRevision,
  type Actor,
  type Json,
} from '../domain/core';
import { commandSchema, requireHeadDecision, type RequestRecord } from '../domain/requests';
import { audit, command, enqueue, safeJson } from './db';
import { approvedEffects } from './payroll';
import { releaseLeave } from './persist-request';
import {
  financeAfterManager,
  financialKind,
  historyAction,
  requestForUpdate,
  resultOf,
  type CommandResult,
} from './request-record';

export async function headDecision(
  actor: Actor,
  id: string,
  rawCommand: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
): Promise<CommandResult> {
  const input = commandSchema.parse(rawCommand);
  invariant(
    input.action === 'approve' || input.action === 'return' || input.action === 'reject',
    'INVALID_HEAD_ACTION',
    'คำสั่งนี้ไม่ใช่การตัดสินใจของหัวหน้า',
    400,
  );
  if (input.action !== 'approve') {
    invariant(input.reason?.trim(), 'REASON_REQUIRED', 'ระบุเหตุผลก่อนส่งกลับหรือไม่อนุมัติ');
  }

  return command(actor, `request.head:${id}`, idempotencyKey, { id, ...input }, async (tx) => {
    const current = await requestForUpdate(tx, id);
    requireRevision(current.revision, input.expectedRevision);
    requireHeadDecision(actor, current);

    const nextRevision = current.revision + 1;
    const workflowState =
      input.action === 'approve' ? 'approved' : input.action === 'return' ? 'returned' : 'rejected';
    const financeState =
      workflowState === 'approved'
        ? financeAfterManager(current.kind, workflowState)
        : 'not_required';

    if (workflowState !== 'approved') {
      await releaseLeave(tx, current, input.reason ?? input.action);
    }

    await tx`
        update requests
        set
          revision = ${nextRevision},
          workflow_state = ${workflowState},
          finance_state = ${financeState},
          payment_state = 'not_applicable',
          updated_at = ${now}
        where id = ${id}
      `;
    await tx`
        insert into approval_actions(request_id, round, actor_id, action, reason)
        values(
          ${id},
          ${current.submission_round},
          ${actor.id},
          ${historyAction(input.action)},
          ${input.reason ?? null}
        )
      `;

    const updated: RequestRecord = {
      ...current,
      revision: nextRevision,
      workflow_state: workflowState,
      finance_state: financeState,
      payment_state: 'not_applicable',
      updated_at: now,
    };

    await audit(
      tx,
      actor,
      `request.head_${input.action}`,
      'request',
      id,
      nextRevision,
      { round: current.submission_round, reason: input.reason ?? null },
      correlationId,
    );

    if (workflowState === 'approved') {
      await approvedEffects(tx, updated, actor, now, correlationId);
    } else {
      await enqueue(
        tx,
        'in_app_notification',
        `${id}:${current.submission_round}:head_${input.action}`,
        {
          employeeId: current.employee_id,
          title: input.action === 'return' ? 'คำขอถูกส่งกลับให้แก้ไข' : 'คำขอไม่ได้รับอนุมัติ',
          href: `/requests/${id}`,
        } satisfies Json,
      );
    }
    return resultOf(updated) as unknown as Json;
  }) as Promise<CommandResult>;
}

export async function financeDecision(
  actor: Actor,
  id: string,
  rawCommand: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
): Promise<CommandResult> {
  const input = commandSchema.parse(rawCommand);
  invariant(
    input.action === 'finance_verify' || input.action === 'finance_return',
    'INVALID_FINANCE_ACTION',
    'คำสั่งนี้ไม่ใช่การตรวจสอบการเงิน',
    400,
  );
  if (input.action === 'finance_return') {
    invariant(input.reason?.trim(), 'REASON_REQUIRED', 'ระบุเหตุผลก่อนส่งกลับรายการ');
  }

  return command(actor, `request.finance:${id}`, idempotencyKey, { id, ...input }, async (tx) => {
    const current = await requestForUpdate(tx, id);
    requireRevision(current.revision, input.expectedRevision);
    requireIndependentFinance(actor, current.employee_id);
    invariant(
      financialKind(current.kind),
      'FINANCE_NOT_REQUIRED',
      'รายการประเภทนี้ไม่ใช้ขั้นตรวจสอบการเงิน',
      409,
    );
    invariant(
      current.workflow_state === 'approved' && current.finance_state === 'pending',
      'FINANCE_NOT_PENDING',
      'รายการนี้ไม่ได้รอตรวจสอบการเงินแล้ว',
      409,
    );

    const nextRevision = current.revision + 1;
    const returning = input.action === 'finance_return';
    const workflowState = returning ? 'returned' : 'approved';
    const financeState = returning ? 'returned' : 'verified';
    const paymentState = returning ? 'not_applicable' : 'unpaid';

    await tx`
        update requests
        set
          revision = ${nextRevision},
          workflow_state = ${workflowState},
          finance_state = ${financeState},
          payment_state = ${paymentState},
          updated_at = ${now}
        where id = ${id}
      `;
    await tx`
        insert into approval_actions(request_id, round, actor_id, action, reason)
        values(
          ${id},
          ${current.submission_round},
          ${actor.id},
          ${historyAction(input.action)},
          ${input.reason ?? null}
        )
      `;

    if (!returning) {
      await tx`
          insert into payable_obligations(
            owner_id,
            source_kind,
            source_id,
            source_round,
            request_id,
            amount_satang,
            currency,
            verified_by,
            state,
            snapshot
          )
          values(
            ${current.employee_id},
            ${current.kind},
            ${current.id},
            ${current.submission_round},
            ${current.id},
            ${current.total_satang},
            'THB',
            ${actor.id},
            'unpaid',
            ${tx.json(
              safeJson({
                requestId: current.id,
                reference: current.reference,
                round: current.submission_round,
                totalSatang: current.total_satang,
                verifiedAt: now.toISOString(),
              }),
            )}
          )
        `;
    }

    const updated: RequestRecord = {
      ...current,
      revision: nextRevision,
      workflow_state: workflowState,
      finance_state: financeState,
      payment_state: paymentState,
      updated_at: now,
    };

    await audit(
      tx,
      actor,
      `request.${input.action}`,
      'request',
      id,
      nextRevision,
      { round: current.submission_round, reason: input.reason ?? null },
      correlationId,
    );
    await enqueue(tx, 'in_app_notification', `${id}:${current.submission_round}:${input.action}`, {
      employeeId: current.employee_id,
      title: returning ? 'การเงินส่งรายการกลับให้แก้ไข' : 'การเงินตรวจสอบรายการแล้ว',
      href: `/requests/${id}`,
    } satisfies Json);
    return resultOf(updated) as unknown as Json;
  }) as Promise<CommandResult>;
}
