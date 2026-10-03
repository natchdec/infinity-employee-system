import { bangkokDate, nextMonth, payrollCutoff, type Calendar } from '../domain/calendar';
import { invariant, type Actor, type Json } from '../domain/core';
import type { RequestRecord } from '../domain/requests';
import { audit, enqueue, policyFor, safeJson, type Transaction } from './db';

export async function allocatePayroll(
  tx: Transaction,
  request: RequestRecord,
  approvedAt: Date,
): Promise<void> {
  let month = [bangkokDate(approvedAt).slice(0, 7), request.business_date.slice(0, 7)]
    .sort()
    .at(-1)!;
  // Serialize creation/closure allocation for the small monthly payroll ledger.
  await tx`select pg_advisory_xact_lock(1709232027)`;
  for (let count = 0; count < 24; count++) {
    const [existing] =
      await tx`select month,cutoff_at,state from payroll_cycles where month=${month} for update`;
    if (existing) {
      if (existing.state === 'open' && approvedAt < new Date(existing.cutoff_at)) {
        await tx`insert into payroll_items(request_id,round,employee_id,cycle_month,amount_satang,state,approved_at) values(${request.id},${request.submission_round},${request.employee_id},${month},${request.total_satang},'queued',${approvedAt})`;
        return;
      }
    } else {
      const rule = await policyFor<{ cutoffDay: number; payday: number }>(
        tx,
        'payroll',
        `${month}-24`,
      );
      const calendar = await policyFor<Calendar>(
        tx,
        'calendar',
        `${month}-${String(rule.body.cutoffDay).padStart(2, '0')}`,
      );
      const cutoff = payrollCutoff(month, calendar.body, rule.body);
      if (approvedAt < cutoff) {
        await tx`insert into payroll_cycles(month,payday,cutoff_at,policy_snapshot) values(${month},${`${month}-${String(rule.body.payday).padStart(2, '0')}`},${cutoff},${tx.json(safeJson({ payroll: rule, calendar }))})`;
        await tx`insert into payroll_items(request_id,round,employee_id,cycle_month,amount_satang,state,approved_at) values(${request.id},${request.submission_round},${request.employee_id},${month},${request.total_satang},'queued',${approvedAt})`;
        return;
      }
    }
    month = nextMonth(month);
  }
  invariant(false, 'PAYROLL_CYCLE_UNAVAILABLE', 'ไม่พบรอบเงินเดือนที่เปิดรับภายในช่วงที่กำหนด');
}

export async function approvedEffects(
  tx: Transaction,
  request: RequestRecord,
  actor: Actor,
  now: Date,
  correlationId: string,
): Promise<void> {
  if (request.kind === 'leave') {
    const [booking] =
      await tx`update leave_bookings set state='approved' where request_id=${request.id} and round=${request.submission_round} and state='held' returning *`;
    invariant(booking, 'LEAVE_RESERVATION_MISSING', 'ไม่พบรายการกันสิทธิ์ลา', 409);
    await tx`insert into leave_ledger(employee_id,type_id,period,units,request_id,round,event_key,reason) values(${request.employee_id},${booking.type_id},${booking.period},${-booking.days},${request.id},${request.submission_round},${`${request.id}:${request.submission_round}:approved`},'Approved leave') on conflict(event_key) do nothing`;
  } else if (request.kind === 'ot') await allocatePayroll(tx, request, now);
  await enqueue(tx, 'in_app_notification', `${request.id}:${request.submission_round}:approved`, {
    employeeId: request.employee_id,
    title: 'คำขอได้รับอนุมัติแล้ว',
    href: `/requests/${request.id}`,
  });
  await audit(
    tx,
    actor,
    'request.approved_effects',
    'request',
    request.id,
    request.revision,
    { kind: request.kind, round: request.submission_round } satisfies Record<string, Json>,
    correlationId,
  );
}

export async function voidQueuedPayroll(tx: Transaction, request: RequestRecord): Promise<void> {
  if (request.kind !== 'ot') return;
  await tx`select pg_advisory_xact_lock(1709232027)`;
  const [item] =
    await tx`select i.id,i.state,c.state as cycle_state from payroll_items i join payroll_cycles c on c.month=i.cycle_month where i.request_id=${request.id} for update of i,c`;
  if (!item) return;
  invariant(
    item.state === 'queued' && item.cycle_state === 'open',
    'PAYROLL_ALREADY_FROZEN',
    'รายการอยู่ในรอบเงินเดือนที่ปิดหรือส่งออกแล้ว ต้องใช้รายการปรับปรุง',
    409,
  );
  await tx`update payroll_items set state='void' where id=${item.id}`;
}
