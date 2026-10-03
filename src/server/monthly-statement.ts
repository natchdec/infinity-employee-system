import { nextMonth } from '../domain/calendar';
import { invariant } from '../domain/core';
import { monthlyStatement, type MonthlyStatement } from '../domain/monthly-summary';
import { db } from './db';

export async function employeeMonthlyStatement(
  employeeId: string,
  month: string,
): Promise<MonthlyStatement> {
  invariant(/^20\d{2}-(0[1-9]|1[0-2])$/.test(month), 'INVALID_MONTH', 'เดือนไม่ถูกต้อง');
  const start = `${month}-01`;
  const end = `${nextMonth(month)}-01`;

  const [ot] = await db()`
    select
      coalesce(sum(l.hours),0)::text as hours,
      coalesce(sum(l.amount_satang),0)::text as amount_satang
    from requests r
    join ot_lines l
      on l.request_id=r.id
     and l.round=r.submission_round
    where r.employee_id=${employeeId}
      and r.kind='ot'
      and r.workflow_state='approved'
      and l.work_date >= ${start}::date
      and l.work_date < ${end}::date
  `;

  const [expense] = await db()`
    select
      coalesce(sum(
        case when l.category_id='mileage'
          then coalesce((l.detail->>'eligibleMetres')::bigint,0)
          else 0 end
      ),0)::text as mileage_metres,
      coalesce(sum(
        case when l.category_id='mileage' then l.amount_satang else 0 end
      ),0)::text as mileage_satang,
      coalesce(sum(
        case when l.category_id<>'mileage' then l.amount_satang else 0 end
      ),0)::text as expense_satang
    from requests r
    join expense_lines l
      on l.request_id=r.id
     and l.round=r.submission_round
    where r.employee_id=${employeeId}
      and r.kind='expense'
      and r.workflow_state='approved'
      and l.expense_date >= ${start}::date
      and l.expense_date < ${end}::date
  `;

  const [leave] = await db()`
    select coalesce(sum(b.days),0)::integer as leave_days
    from requests r
    join leave_bookings b
      on b.request_id=r.id
     and b.round=r.submission_round
    where r.employee_id=${employeeId}
      and r.kind='leave'
      and b.state='approved'
      and r.business_date >= ${start}::date
      and r.business_date < ${end}::date
  `;

  const [advance] = await db()`
    select coalesce(sum(total_satang),0)::text as advance_satang
    from requests
    where employee_id=${employeeId}
      and kind='advance'
      and workflow_state='approved'
      and business_date >= ${start}::date
      and business_date < ${end}::date
  `;

  const [settlement] = await db()`
    select coalesce(sum(abs(net_satang)),0)::text as settlement_satang
    from settlements
    where owner_id=${employeeId}
      and created_at >= ${start}::date
      and created_at < ${end}::date
      and state not in ('returned','void')
  `;

  const paymentRows = await db()`
    select payment_state
    from requests
    where employee_id=${employeeId}
      and business_date >= ${start}::date
      and business_date < ${end}::date
      and workflow_state not in ('rejected','cancelled')
  `;

  return monthlyStatement({
    otHours: Number(ot?.hours ?? 0),
    otSatang: BigInt(ot?.amount_satang ?? 0),
    mileageMetres: Number(expense?.mileage_metres ?? 0),
    mileageSatang: BigInt(expense?.mileage_satang ?? 0),
    expenseSatang: BigInt(expense?.expense_satang ?? 0),
    advanceSatang: BigInt(advance?.advance_satang ?? 0),
    settlementSatang: BigInt(settlement?.settlement_satang ?? 0),
    leaveDays: Number(leave?.leave_days ?? 0),
    paymentStates: paymentRows.map((row) => String(row.payment_state)),
  });
}
