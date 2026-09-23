import { randomUUID } from 'node:crypto';
import { bangkokDate } from '../domain/calendar';
import { invariant, type Actor, type Json } from '../domain/core';
import { managerialRouting, requireOwnEditable, type RequestRecord } from '../domain/requests';
import { audit, command, safeJson } from './db';
import { approvedEffects } from './payroll';
import { persistSubmission } from './persist-request';
import { prepareRequest } from './prepare-request';
import {
  financeAfterManager,
  notifyHead,
  resultOf,
  requestForUpdate,
  type CommandResult,
} from './request-record';

export async function submitNewRequest(
  actor: Actor,
  rawInput: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
): Promise<CommandResult> {
  return command(actor, 'request.submit', idempotencyKey, rawInput, async (tx) => {
    const id = randomUUID();
    const prepared = await prepareRequest(tx, actor, rawInput, id, now);
    const routing = managerialRouting(actor, prepared.headId);
    const financeState = financeAfterManager(prepared.input.kind, routing.state);
    const [sequence] = await tx`select nextval('request_reference_seq')::text as value`;
    const reference = `IES-${bangkokDate(now).slice(0, 4)}-${String(sequence!.value).padStart(6, '0')}`;

    const [inserted] = await tx`
      insert into requests(
        id,
        reference,
        kind,
        employee_id,
        project_reference_id,
        parent_trip_id,
        title,
        business_date,
        draft_payload,
        revision,
        submission_round,
        workflow_state,
        finance_state,
        payment_state,
        total_satang,
        currency,
        assigned_head_id
      )
      values(
        ${id},
        ${reference},
        ${prepared.input.kind},
        ${actor.id},
        ${prepared.input.projectId},
        ${
          prepared.input.kind === 'expense' || prepared.input.kind === 'advance'
            ? prepared.input.parentTripId
            : null
        },
        ${prepared.input.title},
        ${prepared.date},
        ${tx.json(safeJson(prepared.input))},
        1,
        1,
        ${routing.state},
        ${financeState},
        'not_applicable',
        ${prepared.totalSatang},
        'THB',
        ${routing.assignedHeadId}
      )
      returning created_at, updated_at
    `;

    const request: RequestRecord = {
      id,
      reference,
      kind: prepared.input.kind,
      employee_id: actor.id,
      project_reference_id: prepared.input.projectId,
      parent_trip_id:
        prepared.input.kind === 'expense' || prepared.input.kind === 'advance'
          ? prepared.input.parentTripId
          : null,
      title: prepared.input.title,
      business_date: prepared.date,
      draft_payload: safeJson(prepared.input) as Record<string, unknown>,
      revision: 1,
      submission_round: 1,
      workflow_state: routing.state,
      finance_state: financeState,
      payment_state: 'not_applicable',
      total_satang: prepared.totalSatang,
      currency: 'THB',
      assigned_head_id: routing.assignedHeadId,
      created_at: new Date(inserted!.created_at),
      updated_at: new Date(inserted!.updated_at),
    };

    await persistSubmission(tx, request, prepared, 1, now);
    await tx`
      insert into approval_actions(request_id, round, actor_id, action, reason)
      values(
        ${id},
        1,
        ${routing.action === 'system_skipped' ? null : actor.id},
        ${routing.action},
        null
      )
    `;
    await audit(
      tx,
      actor,
      'request.submitted',
      'request',
      id,
      1,
      {
        kind: request.kind,
        routing: routing.action,
        financeState,
      },
      correlationId,
    );
    await notifyHead(tx, request, routing.assignedHeadId);
    if (routing.state === 'approved') {
      await approvedEffects(tx, request, actor, now, correlationId);
    }
    return resultOf(request) as unknown as Json;
  }) as Promise<CommandResult>;
}

export async function resubmitRequest(
  actor: Actor,
  id: string,
  expectedRevision: number,
  rawInput: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
): Promise<CommandResult> {
  const receiptInput = { id, expectedRevision, input: rawInput };
  return command(actor, `request.resubmit:${id}`, idempotencyKey, receiptInput, async (tx) => {
    const current = await requestForUpdate(tx, id);
    requireOwnEditable(actor, current);
    invariant(
      current.revision === expectedRevision,
      'REVISION_CONFLICT',
      'รายการนี้มีการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด',
      409,
    );

    const prepared = await prepareRequest(tx, actor, rawInput, id, now);
    invariant(
      prepared.input.kind === current.kind,
      'REQUEST_KIND_IMMUTABLE',
      'ไม่สามารถเปลี่ยนประเภทคำขอเดิมได้',
      409,
    );
    const routing = managerialRouting(actor, prepared.headId);
    const nextRound = current.submission_round + 1;
    const nextRevision = current.revision + 1;
    const financeState = financeAfterManager(current.kind, routing.state);

    await tx`
        update requests
        set
          project_reference_id = ${prepared.input.projectId},
          parent_trip_id = ${
            prepared.input.kind === 'expense' || prepared.input.kind === 'advance'
              ? prepared.input.parentTripId
              : null
          },
          title = ${prepared.input.title},
          business_date = ${prepared.date},
          draft_payload = ${tx.json(safeJson(prepared.input))},
          revision = ${nextRevision},
          submission_round = ${nextRound},
          workflow_state = ${routing.state},
          finance_state = ${financeState},
          payment_state = 'not_applicable',
          total_satang = ${prepared.totalSatang},
          assigned_head_id = ${routing.assignedHeadId},
          updated_at = ${now}
        where id = ${id}
      `;

    const updated: RequestRecord = {
      ...current,
      project_reference_id: prepared.input.projectId,
      parent_trip_id:
        prepared.input.kind === 'expense' || prepared.input.kind === 'advance'
          ? prepared.input.parentTripId
          : null,
      title: prepared.input.title,
      business_date: prepared.date,
      draft_payload: safeJson(prepared.input) as Record<string, unknown>,
      revision: nextRevision,
      submission_round: nextRound,
      workflow_state: routing.state,
      finance_state: financeState,
      payment_state: 'not_applicable',
      total_satang: prepared.totalSatang,
      assigned_head_id: routing.assignedHeadId,
      updated_at: now,
    };

    await persistSubmission(tx, updated, prepared, nextRound, now);
    await tx`
        insert into approval_actions(request_id, round, actor_id, action, reason)
        values(
          ${id},
          ${nextRound},
          ${routing.action === 'system_skipped' ? null : actor.id},
          ${routing.action},
          'Resubmitted after correction'
        )
      `;
    await audit(
      tx,
      actor,
      'request.resubmitted',
      'request',
      id,
      nextRevision,
      { round: nextRound, routing: routing.action },
      correlationId,
    );
    await notifyHead(tx, updated, routing.assignedHeadId);
    if (routing.state === 'approved') {
      await approvedEffects(tx, updated, actor, now, correlationId);
    }
    return resultOf(updated) as unknown as Json;
  }) as Promise<CommandResult>;
}
