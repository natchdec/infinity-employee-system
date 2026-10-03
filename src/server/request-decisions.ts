import { randomUUID } from 'node:crypto';
import { bangkokDate } from '../domain/calendar';
import {
  invariant,
  requireIndependentFinance,
  requireRevision,
  type Actor,
  type Json,
} from '../domain/core';
import { commandSchema, type RequestRecord } from '../domain/requests';
import { audit, command, safeJson } from './db';
import { enqueueEmployeeNotice } from './notification-queue';
import { approvedEffects, voidQueuedPayroll } from './payroll';
import { releaseLeave } from './persist-request';
import {
  financeAfterManager,
  financialKind,
  historyAction,
  notifyFinancePending,
  notifyFinancePayers,
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
    const decisionDate = bangkokDate(now);
    const delegated =
      current.assigned_head_id && current.assigned_head_id !== actor.id
        ? await tx`
            select id
            from approval_delegations
            where active
              and scope='manager_approval'
              and delegator_id=${current.assigned_head_id}
              and delegate_id=${actor.id}
              and effective_from <= ${decisionDate}::date
              and effective_to >= ${decisionDate}::date
            limit 1
          `
        : [];
    invariant(
      actor.active &&
        actor.roles.includes('head') &&
        current.workflow_state === 'pending_head' &&
        current.employee_id !== actor.id &&
        (current.assigned_head_id === actor.id || delegated.length > 0),
      'FORBIDDEN',
      'คุณไม่ใช่หัวหน้าหรือผู้รับมอบหมายที่อนุมัติรายการนี้ได้',
      403,
    );

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
      await enqueueEmployeeNotice(tx, `${id}:${current.submission_round}:head_approved`, {
        employeeId: current.employee_id,
        title:
          financeState === 'pending'
            ? 'หัวหน้าอนุมัติแล้ว · รอ Finance ตรวจสอบ'
            : 'คำขอได้รับอนุมัติแล้ว',
        detail:
          financeState === 'pending'
            ? `${current.reference} ผ่าน Manager approval แล้ว และถูกส่งต่อให้ Finance Verify`
            : `${current.reference} ได้รับอนุมัติเรียบร้อยแล้ว`,
        href: `/requests/${id}`,
      });
      await notifyFinancePending(tx, updated);
    } else {
      await enqueueEmployeeNotice(tx, `${id}:${current.submission_round}:head_${input.action}`, {
        employeeId: current.employee_id,
        title: input.action === 'return' ? 'คำขอถูกส่งกลับให้แก้ไข' : 'คำขอไม่ได้รับอนุมัติ',
        detail: input.reason?.trim() || `สถานะคำขอ ${current.reference} เปลี่ยนแล้ว`,
        href: `/requests/${id}`,
      });
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
    const routedToTripSettlement =
      !returning && current.kind === 'expense' && current.parent_trip_id !== null;
    const paymentState = returning
      ? 'not_applicable'
      : routedToTripSettlement
        ? 'not_applicable'
        : 'unpaid';

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

    if (!returning && !routedToTripSettlement) {
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
    await enqueueEmployeeNotice(tx, `${id}:${current.submission_round}:${input.action}`, {
      employeeId: current.employee_id,
      title: returning ? 'การเงินส่งรายการกลับให้แก้ไข' : 'การเงินตรวจสอบรายการแล้ว',
      detail: returning
        ? input.reason?.trim() || `${current.reference} ถูกส่งกลับจาก Finance`
        : routedToTripSettlement
          ? `${current.reference} ผ่าน Finance Verify แล้ว และจะไปรวมใน Trip Settlement`
          : `${current.reference} ผ่าน Finance Verify แล้ว และพร้อมเข้าสู่ขั้นจ่ายเงิน`,
      href: `/requests/${id}`,
    });
    if (!returning) {
      await notifyFinancePayers(tx, updated, [actor.id]);
    }
    return resultOf(updated) as unknown as Json;
  }) as Promise<CommandResult>;
}

export async function cancelRequest(
  actor: Actor,
  id: string,
  rawCommand: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
): Promise<CommandResult> {
  const input = commandSchema.parse(rawCommand);
  invariant(
    input.action === 'cancel',
    'INVALID_CANCEL_ACTION',
    'คำสั่งนี้ไม่ใช่การยกเลิกคำขอ',
    400,
  );
  const reason = input.reason?.trim();
  invariant(reason, 'REASON_REQUIRED', 'ระบุเหตุผลในการยกเลิก');

  return command(actor, `request.cancel:${id}`, idempotencyKey, { id, ...input }, async (tx) => {
    const current = await requestForUpdate(tx, id);
    requireRevision(current.revision, input.expectedRevision);
    invariant(current.employee_id === actor.id && actor.active, 'NOT_FOUND', 'ไม่พบรายการ', 404);
    invariant(
      ['pending_head', 'approved', 'returned'].includes(current.workflow_state),
      'REQUEST_NOT_CANCELLABLE',
      'สถานะปัจจุบันไม่สามารถยกเลิกได้',
      409,
    );
    invariant(
      current.finance_state !== 'verified' &&
        !['allocated', 'paid'].includes(current.payment_state),
      'REQUEST_FINANCIALLY_FROZEN',
      'รายการผ่านการเงินหรืออยู่ในกระบวนการจ่ายแล้ว ต้องใช้รายการปรับปรุง',
      409,
    );
    if (current.kind === 'trip') {
      const children = await tx`
        select id from requests
        where parent_trip_id=${current.id}
          and workflow_state not in ('rejected','cancelled')
        limit 1
      `;
      const settlements = await tx`
        select id from settlements
        where trip_id=${current.id} and state not in ('returned','void')
        limit 1
      `;
      invariant(
        !children.length && !settlements.length,
        'TRIP_HAS_ACTIVITY',
        'ทริปมีรายการลูกหรือเริ่มเคลียร์ค่าใช้จ่ายแล้ว',
        409,
      );
    }
    await releaseLeave(tx, current, reason);
    if (current.kind === 'ot' && current.workflow_state === 'approved') {
      await voidQueuedPayroll(tx, current);
    }
    const revision = current.revision + 1;
    await tx`
      update requests
      set revision=${revision},
          workflow_state='cancelled',
          finance_state='not_required',
          payment_state='not_applicable',
          assigned_head_id=null,
          updated_at=${now}
      where id=${id}
    `;
    await tx`
      insert into approval_actions(request_id,round,actor_id,action,reason)
      values(${id},${current.submission_round},${actor.id},${historyAction('cancel')},${reason})
    `;
    await audit(
      tx,
      actor,
      'request.cancelled',
      'request',
      id,
      revision,
      safeJson({ reason, round: current.submission_round }),
      correlationId,
    );
    return resultOf({
      ...current,
      revision,
      workflow_state: 'cancelled',
      finance_state: 'not_required',
      payment_state: 'not_applicable',
      assigned_head_id: null,
      updated_at: now,
    }) as unknown as Json;
  }) as Promise<CommandResult>;
}
