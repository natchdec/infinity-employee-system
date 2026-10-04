import { randomUUID } from 'node:crypto';
import { bangkokDate } from '../domain/calendar';
import { invariant, requireRevision, type Actor, type Json } from '../domain/core';
import { managerialRouting, requireOwnEditable, type RequestRecord } from '../domain/requests';
import { audit, command, safeJson, type Transaction } from './db';
import { approvedEffects } from './payroll';
import { persistSubmission } from './persist-request';
import { prepareRequest } from './prepare-request';
import { assertPeriodAcceptsNewRequest } from './monthly-operations-service';
import {
  financeAfterManager,
  notifyFinancePending,
  notifyHead,
  resultOf,
  requestForUpdate,
  type CommandResult,
} from './request-record';

export interface WorklogSubmissionSource {
  id: string;
  expectedRevision: number;
}

interface ValidatedWorklogSubmission {
  source: WorklogSubmissionSource;
  previousState: string;
  nextRevision: number;
  intent: string;
  businessDate: string;
}

async function validateWorklogSubmissions(
  tx: Transaction,
  actor: Actor,
  sources: readonly WorklogSubmissionSource[],
  requestKind: RequestRecord['kind'],
): Promise<ValidatedWorklogSubmission[]> {
  invariant(
    sources.length >= 1 && sources.length <= 20,
    'WORKLOG_SOURCE_COUNT_INVALID',
    'จำนวน Calendar Draft ที่ใช้สร้างคำขอไม่ถูกต้อง',
    400,
  );
  const uniqueIds = new Set(sources.map((source) => source.id));
  invariant(
    uniqueIds.size === sources.length,
    'WORKLOG_SOURCE_DUPLICATE',
    'Calendar Draft ซ้ำกันในคำขอเดียวกัน',
    400,
  );

  const validated: ValidatedWorklogSubmission[] = [];
  for (const source of [...sources].sort((a, b) => a.id.localeCompare(b.id))) {
    const [row] = await tx`
      select
        id, employee_id, intent, state, revision,
        (start_at at time zone 'Asia/Bangkok')::date::text as business_date
      from worklog_items
      where id=${source.id}
      for update
    `;
    invariant(row && row.employee_id === actor.id, 'NOT_FOUND', 'ไม่พบ Calendar Draft', 404);
    requireRevision(Number(row.revision), source.expectedRevision);
    invariant(
      ['suggested', 'confirmed', 'exception'].includes(String(row.state)),
      'WORKLOG_NOT_SUBMITTABLE',
      'Calendar Draft นี้ไม่สามารถสร้างคำขอใหม่ได้',
      409,
    );
    const expectedKind =
      row.intent === 'ot'
        ? 'ot'
        : row.intent === 'leave'
          ? 'leave'
          : row.intent === 'onsite'
            ? 'expense'
            : null;
    invariant(
      expectedKind === requestKind,
      'WORKLOG_REQUEST_KIND_MISMATCH',
      'ประเภทคำขอไม่ตรงกับ Calendar Draft',
      409,
    );
    const linked = await tx`
      select request_id
      from worklog_request_links
      where worklog_item_id=${source.id}
      limit 1
    `;
    invariant(
      linked.length === 0,
      'WORKLOG_ALREADY_SUBMITTED',
      'Calendar Draft นี้ถูกสร้างเป็นคำขอแล้ว',
      409,
    );
    validated.push({
      source,
      previousState: String(row.state),
      nextRevision: Number(row.revision) + 1,
      intent: String(row.intent),
      businessDate: String(row.business_date),
    });
  }

  if (validated.length > 1) {
    invariant(
      requestKind === 'expense' &&
        validated.every((item) => item.intent === 'onsite') &&
        new Set(validated.map((item) => item.businessDate)).size === 1,
      'WORKLOG_GROUP_INVALID',
      'รวม Calendar Draft ได้เฉพาะ Onsite หลายจุดในวันเดียวกัน',
      409,
    );
  }
  return validated;
}

export async function submitNewRequest(
  actor: Actor,
  rawInput: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
  sourceWorklogs?: readonly WorklogSubmissionSource[],
): Promise<CommandResult> {
  if (sourceWorklogs?.length) {
    for (const source of sourceWorklogs) {
      invariant(/^[0-9a-f-]{36}$/i.test(source.id), 'NOT_FOUND', 'ไม่พบ Calendar Draft', 404);
      invariant(
        Number.isSafeInteger(source.expectedRevision) && source.expectedRevision >= 1,
        'REVISION_REQUIRED',
        'ต้องระบุ revision ล่าสุดของ Calendar Draft',
        400,
      );
    }
  }
  const receiptInput = sourceWorklogs?.length ? { input: rawInput, sourceWorklogs } : rawInput;
  return command(actor, 'request.submit', idempotencyKey, receiptInput, async (tx) => {
    const id = randomUUID();
    const prepared = await prepareRequest(tx, actor, rawInput, id, now);
    const worklogs = sourceWorklogs?.length
      ? await validateWorklogSubmissions(tx, actor, sourceWorklogs, prepared.input.kind)
      : [];
    await assertPeriodAcceptsNewRequest(
      tx,
      prepared.input.kind === 'ot' || prepared.input.kind === 'leave' ? 'payroll' : 'claims',
      prepared.date,
    );
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
    for (const worklog of worklogs) {
      await tx`
        insert into worklog_request_links(worklog_item_id,request_id,request_round)
        values(${worklog.source.id},${id},1)
      `;
      const [updatedWorklog] = await tx`
        update worklog_items
        set state='submitted',
            submitted_at=${now},
            revision=revision+1,
            updated_at=${now}
        where id=${worklog.source.id}
          and revision=${worklog.source.expectedRevision}
        returning revision
      `;
      invariant(
        updatedWorklog && Number(updatedWorklog.revision) === worklog.nextRevision,
        'REVISION_CONFLICT',
        'Calendar Draft มีการเปลี่ยนแปลงแล้ว กรุณาโหลดใหม่',
        409,
      );
      await audit(
        tx,
        actor,
        'worklog.submitted',
        'worklog_item',
        worklog.source.id,
        worklog.nextRevision,
        {
          requestId: id,
          requestKind: prepared.input.kind,
          from: worklog.previousState,
          to: 'submitted',
          groupedSourceCount: worklogs.length,
        },
        correlationId,
      );
    }

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
        approvalRoute: prepared.approvalRoute,
        financeState,
      },
      correlationId,
    );
    await notifyHead(tx, request, routing.assignedHeadId);
    if (routing.state === 'approved') {
      await approvedEffects(tx, request, actor, now, correlationId);
      await notifyFinancePending(tx, request);
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
    await assertPeriodAcceptsNewRequest(
      tx,
      prepared.input.kind === 'ot' || prepared.input.kind === 'leave' ? 'payroll' : 'claims',
      prepared.date,
    );
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
      { round: nextRound, routing: routing.action, approvalRoute: prepared.approvalRoute },
      correlationId,
    );
    await notifyHead(tx, updated, routing.assignedHeadId);
    if (routing.state === 'approved') {
      await approvedEffects(tx, updated, actor, now, correlationId);
      await notifyFinancePending(tx, updated);
    }
    return resultOf(updated) as unknown as Json;
  }) as Promise<CommandResult>;
}
