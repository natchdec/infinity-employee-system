import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bangkokDate } from '../domain/calendar';
import {
  invariant,
  requireIndependentFinance,
  requireRevision,
  type Actor,
  type Json,
} from '../domain/core';
import { validateAdjustment } from '../domain/monthly-operations';
import { audit, command, safeJson, type Transaction } from './db';
import { assertPeriodAcceptsNewRequest } from './monthly-operations-service';
import { resolveAdjustmentSource, type AdjustmentSourceType } from './adjustment-source';

const createSchema = z
  .object({
    action: z.literal('create'),
    sourceType: z.enum(['request', 'payroll_item', 'obligation', 'settlement']),
    sourceId: z.string().uuid(),
    sourceRound: z.number().int().min(1).optional(),
    targetMonth: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
    reason: z.string().trim().min(3).max(2000),
    delta: z.record(z.string(), z.unknown()),
  })
  .strict();

const headSchema = z
  .object({
    action: z.enum(['head_approve', 'head_void']),
    id: z.string().uuid(),
    expectedRevision: z.number().int().min(1),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

const financeSchema = z
  .object({
    action: z.enum(['finance_verify', 'finance_apply', 'finance_void']),
    id: z.string().uuid(),
    expectedRevision: z.number().int().min(1),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

async function assignedHead(
  tx: Transaction,
  ownerId: string,
  date: string,
): Promise<{ headId: string | null; ownerIsHead: boolean }> {
  const [owner] = await tx`
    select id,is_head_owner,active
    from employees
    where id=${ownerId}
  `;
  invariant(
    owner?.active,
    'ADJUSTMENT_OWNER_NOT_AVAILABLE',
    'พนักงานเจ้าของรายการไม่พร้อมใช้งาน',
    409,
  );
  if (owner.is_head_owner) return { headId: null, ownerIsHead: true };

  const heads = await tx`
    select rl.head_id
    from reporting_lines rl
    join employees h on h.id=rl.head_id
    where rl.employee_id=${ownerId}
      and rl.effective_from <= ${date}::date
      and (rl.effective_to is null or rl.effective_to > ${date}::date)
      and h.active
      and exists(
        select 1 from employee_roles er
        where er.employee_id=h.id and er.role='head'
      )
  `;
  invariant(
    heads.length === 1 && heads[0]!.head_id !== ownerId,
    'HEAD_NOT_CONFIGURED',
    'ต้องมีหัวหน้าตามสายงานที่เปิดใช้งานเพียงหนึ่งคน',
    409,
  );
  return { headId: String(heads[0]!.head_id), ownerIsHead: false };
}

export async function createAdjustment(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
) {
  const input = createSchema.parse(raw);
  const normalized = validateAdjustment({
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceRound: input.sourceRound,
    targetMonth: input.targetMonth,
    reason: input.reason,
    delta: input.delta,
  });

  return command(actor, 'adjustment.create', idempotencyKey, input, async (tx) => {
    const source = await resolveAdjustmentSource(
      tx,
      normalized.sourceType as AdjustmentSourceType,
      normalized.sourceId,
      normalized.sourceRound,
    );
    invariant(
      actor.id === source.ownerId ||
        actor.roles.includes('finance') ||
        actor.roles.includes('admin'),
      'FORBIDDEN',
      'คุณไม่มีสิทธิ์สร้างรายการปรับปรุงสำหรับรายการนี้',
      403,
    );
    invariant(
      source.frozen,
      'ADJUSTMENT_SOURCE_NOT_FROZEN',
      'รายการต้นทางยังแก้ผ่าน workflow ปกติได้ จึงยังไม่ควรสร้าง Adjustment',
      409,
    );
    await assertPeriodAcceptsNewRequest(tx, source.family, `${normalized.targetMonth}-01`);

    const routing = await assignedHead(tx, source.ownerId, bangkokDate(now));
    const state = routing.ownerIsHead ? 'finance_pending' : 'pending_head';
    const id = randomUUID();
    const delta = safeJson({
      change: normalized.delta,
      sourceSnapshot: source.snapshot,
      sourceMonth: source.sourceMonth,
      family: source.family,
    });

    const [created] = await tx`
      insert into adjustments(
        id,owner_id,source_type,source_id,source_round,target_month,reason,delta,state,revision,
        assigned_head_id,created_by,created_at,updated_at
      )
      values(
        ${id},${source.ownerId},${normalized.sourceType},${normalized.sourceId},
        ${source.sourceRound},${normalized.targetMonth},${normalized.reason},${tx.json(delta)},
        ${state},1,${routing.headId},${actor.id},${now},${now}
      )
      returning revision
    `;
    await audit(
      tx,
      actor,
      'adjustment.created',
      'adjustment',
      id,
      Number(created!.revision),
      {
        sourceType: normalized.sourceType,
        sourceId: normalized.sourceId,
        sourceRound: source.sourceRound,
        sourceMonth: source.sourceMonth,
        targetMonth: normalized.targetMonth,
        family: source.family,
        state,
      },
      correlationId,
    );
    return { id, state, revision: Number(created!.revision) } as Json;
  });
}

async function canApproveAsHead(
  tx: Transaction,
  actor: Actor,
  assignedHeadId: string | null,
  ownerId: string,
  now: Date,
): Promise<boolean> {
  if (!assignedHeadId || !actor.active || !actor.roles.includes('head') || actor.id === ownerId)
    return false;
  if (assignedHeadId === actor.id) return true;
  const date = bangkokDate(now);
  const delegated = await tx`
    select id
    from approval_delegations
    where active
      and scope='manager_approval'
      and delegator_id=${assignedHeadId}
      and delegate_id=${actor.id}
      and effective_from <= ${date}::date
      and effective_to >= ${date}::date
    limit 1
  `;
  return delegated.length > 0;
}

export async function headAdjustmentDecision(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
) {
  const input = headSchema.parse(raw);
  if (input.action === 'head_void') {
    invariant(input.reason?.trim(), 'REASON_REQUIRED', 'ระบุเหตุผลที่ไม่อนุมัติ Adjustment');
  }
  return command(actor, `adjustment.head:${input.id}`, idempotencyKey, input, async (tx) => {
    const [current] = await tx`
      select id,owner_id,assigned_head_id,state,revision
      from adjustments
      where id=${input.id}
      for update
    `;
    invariant(current, 'NOT_FOUND', 'ไม่พบ Adjustment', 404);
    requireRevision(Number(current.revision), input.expectedRevision);
    invariant(
      current.state === 'pending_head',
      'ADJUSTMENT_NOT_PENDING_HEAD',
      'Adjustment นี้ไม่ได้รอ Head แล้ว',
      409,
    );
    invariant(
      await canApproveAsHead(
        tx,
        actor,
        current.assigned_head_id ? String(current.assigned_head_id) : null,
        String(current.owner_id),
        now,
      ),
      'FORBIDDEN',
      'คุณไม่ใช่ Head หรือผู้รับมอบหมายของ Adjustment นี้',
      403,
    );
    const state = input.action === 'head_approve' ? 'finance_pending' : 'void';
    const [updated] = await tx`
      update adjustments
      set state=${state},revision=revision+1,updated_at=${now}
      where id=${input.id}
      returning revision
    `;
    await audit(
      tx,
      actor,
      input.action === 'head_approve' ? 'adjustment.head_approved' : 'adjustment.head_voided',
      'adjustment',
      input.id,
      Number(updated!.revision),
      { reason: input.reason ?? null, state },
      correlationId,
    );
    return { id: input.id, state, revision: Number(updated!.revision) } as Json;
  });
}

export async function financeAdjustmentDecision(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
) {
  const input = financeSchema.parse(raw);
  if (input.action === 'finance_void') {
    invariant(input.reason?.trim(), 'REASON_REQUIRED', 'ระบุเหตุผลที่ยกเลิก Adjustment');
  }
  return command(actor, `adjustment.finance:${input.id}`, idempotencyKey, input, async (tx) => {
    const [current] = await tx`
      select id,owner_id,state,revision
      from adjustments
      where id=${input.id}
      for update
    `;
    invariant(current, 'NOT_FOUND', 'ไม่พบ Adjustment', 404);
    requireRevision(Number(current.revision), input.expectedRevision);
    requireIndependentFinance(actor, String(current.owner_id));

    let state: 'verified' | 'applied' | 'void';
    if (input.action === 'finance_verify') {
      invariant(
        current.state === 'finance_pending',
        'ADJUSTMENT_NOT_FINANCE_PENDING',
        'Adjustment นี้ไม่ได้รอ Finance verification',
        409,
      );
      state = 'verified';
    } else if (input.action === 'finance_apply') {
      invariant(
        current.state === 'verified',
        'ADJUSTMENT_NOT_VERIFIED',
        'ต้อง Verify Adjustment ก่อน Apply',
        409,
      );
      state = 'applied';
    } else {
      invariant(
        current.state === 'finance_pending' || current.state === 'verified',
        'ADJUSTMENT_NOT_VOIDABLE',
        'สถานะ Adjustment นี้ไม่สามารถยกเลิกได้',
        409,
      );
      state = 'void';
    }

    const [updated] = await tx`
      update adjustments
      set state=${state},
          revision=revision+1,
          verified_by=case when ${state === 'verified'} then ${actor.id}::uuid else verified_by end,
          verified_at=case when ${state === 'verified'} then ${now} else verified_at end,
          applied_by=case when ${state === 'applied'} then ${actor.id}::uuid else applied_by end,
          applied_at=case when ${state === 'applied'} then ${now} else applied_at end,
          updated_at=${now}
      where id=${input.id}
      returning revision
    `;
    await audit(
      tx,
      actor,
      `adjustment.${state}`,
      'adjustment',
      input.id,
      Number(updated!.revision),
      { reason: input.reason ?? null, state },
      correlationId,
    );
    return { id: input.id, state, revision: Number(updated!.revision) } as Json;
  });
}
