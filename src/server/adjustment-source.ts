import { bangkokDate } from '../domain/calendar';
import { invariant, type Json } from '../domain/core';
import type { MonthlyPeriodFamily } from '../domain/monthly-operations';
import { safeJson, type Transaction } from './db';

export interface AdjustmentSource {
  ownerId: string;
  sourceRound: number | null;
  family: MonthlyPeriodFamily;
  sourceMonth: string;
  frozen: boolean;
  snapshot: Json;
}

export type AdjustmentSourceType = 'request' | 'payroll_item' | 'obligation' | 'settlement';

export async function resolveAdjustmentSource(
  tx: Transaction,
  sourceType: AdjustmentSourceType,
  sourceId: string,
  requestedRound?: number,
): Promise<AdjustmentSource> {
  if (sourceType === 'request') {
    const [row] = await tx`
      select
        r.reference,r.kind,r.employee_id,r.submission_round,r.business_date::text,
        r.workflow_state,r.finance_state,r.payment_state,r.total_satang::text,
        p.state as period_state,
        exists(
          select 1 from payroll_items pi
          where pi.request_id=r.id and pi.state='exported'
        ) as payroll_exported
      from requests r
      left join monthly_operational_periods p
        on p.month=to_char(r.business_date,'YYYY-MM')
       and p.family=case when r.kind in ('ot','leave') then 'payroll' else 'claims' end
      where r.id=${sourceId}
      for update of r
    `;
    invariant(row, 'ADJUSTMENT_SOURCE_NOT_FOUND', 'ไม่พบรายการต้นทาง', 404);
    const round = requestedRound ?? Number(row.submission_round);
    invariant(
      round === Number(row.submission_round),
      'ADJUSTMENT_SOURCE_ROUND_STALE',
      'ต้องอ้างอิง submission round ปัจจุบันของคำขอ',
      409,
    );
    const family: MonthlyPeriodFamily =
      row.kind === 'ot' || row.kind === 'leave' ? 'payroll' : 'claims';
    return {
      ownerId: String(row.employee_id),
      sourceRound: round,
      family,
      sourceMonth: String(row.business_date).slice(0, 7),
      frozen:
        row.period_state === 'locked' ||
        row.payment_state === 'allocated' ||
        row.payment_state === 'paid' ||
        Boolean(row.payroll_exported),
      snapshot: safeJson({
        reference: row.reference,
        kind: row.kind,
        round,
        businessDate: row.business_date,
        workflowState: row.workflow_state,
        financeState: row.finance_state,
        paymentState: row.payment_state,
        totalSatang: row.total_satang,
      }),
    };
  }

  if (sourceType === 'payroll_item') {
    const [row] = await tx`
      select
        i.employee_id,i.round,i.cycle_month,i.amount_satang::text,i.state,
        c.state as cycle_state,r.reference
      from payroll_items i
      join payroll_cycles c on c.month=i.cycle_month
      join requests r on r.id=i.request_id
      where i.id=${sourceId}
      for update of i
    `;
    invariant(row, 'ADJUSTMENT_SOURCE_NOT_FOUND', 'ไม่พบ Payroll item ต้นทาง', 404);
    const round = requestedRound ?? Number(row.round);
    invariant(
      round === Number(row.round),
      'ADJUSTMENT_SOURCE_ROUND_STALE',
      'Payroll item round ไม่ตรงกับรายการต้นทาง',
      409,
    );
    return {
      ownerId: String(row.employee_id),
      sourceRound: round,
      family: 'payroll',
      sourceMonth: String(row.cycle_month),
      frozen:
        row.state === 'exported' || row.cycle_state === 'exported' || row.cycle_state === 'closed',
      snapshot: safeJson({
        reference: row.reference,
        round,
        cycleMonth: row.cycle_month,
        itemState: row.state,
        cycleState: row.cycle_state,
        amountSatang: row.amount_satang,
      }),
    };
  }

  if (sourceType === 'obligation') {
    const [row] = await tx`
      select
        o.owner_id,o.source_round,o.source_kind,o.amount_satang::text,o.state,o.paid_at,
        coalesce(r.reference,'SET-' || left(o.source_id::text,8)) as reference
      from payable_obligations o
      left join requests r on r.id=o.request_id
      where o.id=${sourceId}
      for update of o
    `;
    invariant(row, 'ADJUSTMENT_SOURCE_NOT_FOUND', 'ไม่พบรายการจ่ายต้นทาง', 404);
    const round = requestedRound ?? Number(row.source_round);
    invariant(
      round === Number(row.source_round),
      'ADJUSTMENT_SOURCE_ROUND_STALE',
      'รอบอ้างอิงของรายการจ่ายไม่ตรงกับต้นทาง',
      409,
    );
    const date = row.paid_at ? new Date(row.paid_at) : new Date();
    return {
      ownerId: String(row.owner_id),
      sourceRound: round,
      family: 'claims',
      sourceMonth: bangkokDate(date).slice(0, 7),
      frozen: row.state === 'paid',
      snapshot: safeJson({
        reference: row.reference,
        sourceKind: row.source_kind,
        sourceRound: round,
        state: row.state,
        amountSatang: row.amount_satang,
        paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      }),
    };
  }

  const [row] = await tx`
    select
      s.owner_id,s.revision,s.state,s.actual_satang::text,s.paid_advance_satang::text,
      s.net_satang::text,s.created_at,r.reference
    from settlements s
    join requests r on r.id=s.trip_id
    where s.id=${sourceId}
    for update of s
  `;
  invariant(row, 'ADJUSTMENT_SOURCE_NOT_FOUND', 'ไม่พบ Settlement ต้นทาง', 404);
  invariant(
    requestedRound === undefined,
    'ADJUSTMENT_SOURCE_ROUND_INVALID',
    'Settlement ไม่ใช้ source round',
    409,
  );
  return {
    ownerId: String(row.owner_id),
    sourceRound: null,
    family: 'claims',
    sourceMonth: bangkokDate(new Date(row.created_at)).slice(0, 7),
    frozen: row.state === 'settled',
    snapshot: safeJson({
      reference: row.reference,
      revision: Number(row.revision),
      state: row.state,
      actualSatang: row.actual_satang,
      paidAdvanceSatang: row.paid_advance_satang,
      netSatang: row.net_satang,
    }),
  };
}
