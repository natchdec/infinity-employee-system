import { z } from 'zod';
import { invariant, type Actor, type Json } from '../domain/core';
import {
  transitionMonthlyPeriod,
  type MonthlyPeriodFamily,
  type MonthlyPeriodState,
} from '../domain/monthly-operations';
import { audit, command, type Transaction } from './db';

const transitionSchema = z
  .object({
    month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
    family: z.enum(['payroll', 'claims']),
    target: z.enum(['open', 'closing', 'locked']),
    expectedRevision: z.number().int().min(0),
  })
  .strict();

async function blockingCount(
  tx: Transaction,
  month: string,
  family: MonthlyPeriodFamily,
): Promise<number> {
  const start = `${month}-01`;
  const [year, numericMonth] = month.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year!, numericMonth!, 1));
  const end = nextDate.toISOString().slice(0, 10);

  if (family === 'payroll') {
    const [row] = await tx`
      select count(*)::integer as count
      from requests r
      where r.kind='ot'
        and r.business_date >= ${start}::date
        and r.business_date < ${end}::date
        and r.workflow_state='pending_head'
    `;
    return Number(row?.count ?? 0);
  }

  const [row] = await tx`
    select
      (
        select count(*)::integer
        from requests r
        where r.kind in ('expense','advance','trip')
          and r.business_date >= ${start}::date
          and r.business_date < ${end}::date
          and (
            r.workflow_state='pending_head'
            or r.finance_state='pending'
          )
      )
      +
      (
        select count(*)::integer
        from settlements s
        where s.created_at >= ${start}::date
          and s.created_at < ${end}::date
          and s.state in ('submitted','refund_due','top_up_due')
      )
      +
      (
        select count(*)::integer
        from adjustments a
        where a.target_month=${month}
          and a.state not in ('applied','void')
      ) as count
  `;
  return Number(row?.count ?? 0);
}

export async function transitionOperationalPeriod(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  now: Date,
  correlationId: string,
) {
  const input = transitionSchema.parse(raw);
  invariant(
    actor.roles.includes('finance') || actor.roles.includes('admin'),
    'FORBIDDEN',
    'เฉพาะ Finance/Admin ที่เปลี่ยนสถานะรอบเดือนได้',
    403,
  );

  return command(actor, 'monthly-period.transition', idempotencyKey, input, async (tx) => {
    const [existing] = await tx`
      select month,family,state,revision
      from monthly_operational_periods
      where month=${input.month} and family=${input.family}
      for update
    `;

    const currentState = (existing?.state ?? 'open') as MonthlyPeriodState;
    const currentRevision = Number(existing?.revision ?? 0);
    invariant(
      currentRevision === input.expectedRevision,
      'STALE_REVISION',
      'รอบเดือนถูกแก้ไขจากหน้าจออื่น กรุณาโหลดใหม่',
      409,
    );

    const nextState = transitionMonthlyPeriod(currentState, input.target);
    if (nextState === 'locked') {
      const blockers = await blockingCount(tx, input.month, input.family);
      invariant(
        blockers === 0,
        'MONTHLY_PERIOD_NOT_READY',
        `ยังมี ${blockers} รายการที่ต้องปิดก่อน Lock รอบเดือน`,
        409,
      );
    }

    let revision: number;
    if (!existing) {
      const [created] = await tx`
        insert into monthly_operational_periods(
          month,family,state,revision,policy_snapshot,changed_by,changed_at,locked_at
        )
        values(
          ${input.month},${input.family},${nextState},1,'{}'::jsonb,${actor.id},${now},
          ${nextState === 'locked' ? now : null}
        )
        returning revision
      `;
      revision = Number(created!.revision);
    } else {
      const [updated] = await tx`
        update monthly_operational_periods
        set state=${nextState},
            revision=revision+1,
            changed_by=${actor.id},
            changed_at=${now},
            locked_at=${nextState === 'locked' ? now : null}
        where month=${input.month}
          and family=${input.family}
          and revision=${input.expectedRevision}
        returning revision
      `;
      invariant(updated, 'STALE_REVISION', 'รอบเดือนถูกแก้ไขจากหน้าจออื่น กรุณาโหลดใหม่', 409);
      revision = Number(updated.revision);
    }

    const entityId = `${input.month}:${input.family}`;
    const metadata: Json = {
      month: input.month,
      family: input.family,
      from: currentState,
      to: nextState,
    };
    await audit(
      tx,
      actor,
      'monthly_period.transitioned',
      'monthly_operational_period',
      entityId,
      revision,
      metadata,
      correlationId,
    );

    return {
      month: input.month,
      family: input.family,
      state: nextState,
      revision,
    };
  });
}

export async function assertPeriodAcceptsNewRequest(
  tx: Transaction,
  family: MonthlyPeriodFamily,
  businessDate: string,
): Promise<void> {
  const month = businessDate.slice(0, 7);
  const [period] = await tx`
    select state
    from monthly_operational_periods
    where month=${month} and family=${family}
  `;
  invariant(
    !period || period.state === 'open',
    'MONTHLY_PERIOD_CLOSED_FOR_NEW_REQUESTS',
    'รอบเดือนนี้เริ่มปิดแล้ว กรุณาใช้ Adjustment สำหรับรายการย้อนหลัง',
    409,
  );
}
