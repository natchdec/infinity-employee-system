import { addDays, bangkokDate, BUSINESS_TIME_ZONE } from '../domain/calendar';
import { config } from './config';
import { db, enqueue } from './db';

interface ReminderInsert {
  employeeId: string;
  eventKey: string;
  title: string;
  href: string;
  teamsDetail?: string;
  teamsKey?: string;
}

function bangkokMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value('hour') * 60 + value('minute');
}

export async function queueApprovalDigestEmails(now = new Date()): Promise<number> {
  if (!config().EMAIL_NOTIFICATIONS_ENABLED) return 0;
  const minutes = bangkokMinutes(now);
  // Send once from 08:30 onward; keep a morning catch-up window for worker restarts.
  if (minutes < 8 * 60 + 30 || minutes >= 12 * 60) return 0;

  const date = bangkokDate(now);
  const recipients = await db()`
    with recipients as (
      select r.assigned_head_id as employee_id
      from requests r
      where r.workflow_state='pending_head'
        and r.assigned_head_id is not null
      union
      select d.delegate_id as employee_id
      from requests r
      join approval_delegations d
        on d.delegator_id=r.assigned_head_id
       and d.active
       and d.scope='manager_approval'
       and d.effective_from <= ${date}::date
       and d.effective_to >= ${date}::date
      where r.workflow_state='pending_head'
    )
    select distinct employee_id
    from recipients
    where employee_id is not null
  `;

  let queued = 0;
  await db().begin(async (tx) => {
    for (const row of recipients) {
      const employeeId = String(row.employee_id);
      const inserted = await tx`
        insert into jobs(kind,dedupe_key,payload)
        values(
          'approval_digest_email',
          ${`approval-digest:${date}:${employeeId}`},
          ${tx.json({ employeeId, date })}
        )
        on conflict(dedupe_key) do nothing
        returning id
      `;
      queued += inserted.length;
    }
  });
  return queued;
}

async function insertReminders(rows: ReminderInsert[]): Promise<number> {
  if (!rows.length) return 0;
  const teamsEnabled = config().TEAMS_NOTIFICATIONS_ENABLED;
  let inserted = 0;
  await db().begin(async (tx) => {
    for (const row of rows) {
      const result = await tx`
        insert into notifications(employee_id,event_key,kind,title,href)
        values(${row.employeeId},${row.eventKey},'reminder',${row.title},${row.href})
        on conflict(event_key) do nothing
        returning id
      `;
      if (!result.length) continue;
      inserted++;
      if (teamsEnabled && row.teamsDetail && row.teamsKey) {
        await enqueue(tx, 'teams_workflow_notification', `teams:${row.teamsKey}`, {
          title: row.title,
          detail: row.teamsDetail,
          href: row.href,
        });
      }
    }
  });
  return inserted;
}

export async function queueOperationalReminders(now = new Date()): Promise<number> {
  const date = bangkokDate(now);
  const tomorrow = addDays(date, 1);
  const cutoffEnd = addDays(date, 2);
  const pending: ReminderInsert[] = [];

  const worklog = await db()`
    select employee_id,count(*)::integer as count
    from worklog_items
    where state in ('suggested','confirmed','exception')
    group by employee_id
  `;
  for (const row of worklog) {
    pending.push({
      employeeId: String(row.employee_id),
      eventKey: `reminder:worklog:${date}:${row.employee_id}`,
      title: `มี Calendar Draft ${row.count} รายการที่ยังต้องตรวจสอบ`,
      href: '/worklog?view=pending',
    });
  }

  const approvals = await db()`
    with recipients as (
      select r.assigned_head_id as employee_id
      from requests r
      where r.workflow_state='pending_head' and r.assigned_head_id is not null
      union all
      select d.delegate_id
      from requests r
      join approval_delegations d
        on d.delegator_id=r.assigned_head_id
       and d.active
       and d.scope='manager_approval'
       and d.effective_from <= ${date}::date
       and d.effective_to >= ${date}::date
      where r.workflow_state='pending_head'
    )
    select employee_id,count(*)::integer as count
    from recipients
    group by employee_id
  `;
  for (const row of approvals) {
    pending.push({
      employeeId: String(row.employee_id),
      eventKey: `reminder:approvals:${date}:${row.employee_id}`,
      title: `มี ${row.count} คำขอรอการอนุมัติ`,
      href: '/approvals',
    });
  }

  const receiptGaps = await db()`
    select r.employee_id,count(*)::integer as count
    from original_receipts o
    join requests r on r.id=o.request_id
    where o.state='outstanding'
    group by r.employee_id
  `;
  for (const row of receiptGaps) {
    pending.push({
      employeeId: String(row.employee_id),
      eventKey: `reminder:receipts:${date}:${row.employee_id}`,
      title: `มี ${row.count} รายการที่ยังรอใบเสร็จต้นฉบับ`,
      href: '/exceptions',
    });
  }

  const settlements = await db()`
    select owner_id,
           count(*) filter (where due_date < ${date}::date)::integer as overdue,
           count(*) filter (where due_date between ${date}::date and ${tomorrow}::date)::integer as due_soon
    from settlements
    where state in ('submitted','refund_due','top_up_due')
      and due_date <= ${tomorrow}::date
    group by owner_id
  `;
  for (const row of settlements) {
    const overdue = Number(row.overdue ?? 0);
    const dueSoon = Number(row.due_soon ?? 0);
    pending.push({
      employeeId: String(row.owner_id),
      eventKey: `reminder:settlement:${date}:${row.owner_id}`,
      title:
        overdue > 0
          ? `Settlement เกินกำหนด ${overdue} รายการ`
          : `Settlement ใกล้ครบกำหนด ${dueSoon} รายการ`,
      href: '/trips',
    });
  }

  const financeUsers = await db()`
    select distinct e.id
    from employees e
    join employee_roles er on er.employee_id=e.id and er.role='finance'
    where e.active
  `;
  const [financeQueue] = await db()`
    select
      (select count(*)::integer from requests where finance_state='pending') as verify_count,
      (select count(*)::integer from payable_obligations where state='unpaid') as pay_count
  `;
  const verifyCount = Number(financeQueue?.verify_count ?? 0);
  const payCount = Number(financeQueue?.pay_count ?? 0);
  if (verifyCount + payCount > 0) {
    for (const user of financeUsers) {
      pending.push({
        employeeId: String(user.id),
        eventKey: `reminder:finance:${date}:${user.id}`,
        title: `Finance queue: รอตรวจ ${verifyCount} · พร้อมจ่าย ${payCount}`,
        href: '/finance',
        teamsDetail: `คิวรวมของ Finance: รอตรวจ ${verifyCount} รายการ และพร้อมจ่าย ${payCount} รายการ`,
        teamsKey: `finance:${date}`,
      });
    }
  }

  const cutoff = await db()`
    select month
    from payroll_cycles
    where state='open'
      and (cutoff_at at time zone 'Asia/Bangkok')::date
          between ${date}::date and ${cutoffEnd}::date
    order by cutoff_at
    limit 1
  `;
  if (cutoff.length) {
    for (const user of financeUsers) {
      pending.push({
        employeeId: String(user.id),
        eventKey: `reminder:payroll-cutoff:${date}:${user.id}`,
        title: `Payroll ${cutoff[0]!.month} ใกล้ถึง cutoff`,
        href: '/finance/payroll',
        teamsDetail:
          'Payroll cutoff อยู่ในช่วง 2 วันข้างหน้า กรุณาตรวจคิวอนุมัติและรายการ OT ก่อนปิดรอบ',
        teamsKey: `payroll-cutoff:${date}:${cutoff[0]!.month}`,
      });
    }
  }

  return insertReminders(pending);
}
