import { db } from './db';

export type ReconciliationSeverity = 'blocking' | 'review';

export interface ReconciliationIssue {
  id: string;
  severity: ReconciliationSeverity;
  title: string;
  detail: string;
  href: string;
}

export interface FinanceReconciliation {
  overdueSettlements: number;
  paidReceiptGaps: number;
  allocatedOrphans: number;
  paidOrphans: number;
  payrollPastCutoff: number;
  failedExports: number;
  issues: ReconciliationIssue[];
}

export async function financeReconciliation(): Promise<FinanceReconciliation> {
  const [counts] = await db()`
    select
      (
        select count(*)::integer
        from settlements
        where state in ('submitted','refund_due','top_up_due')
          and due_date < (now() at time zone 'Asia/Bangkok')::date
      ) as overdue_settlements,
      (
        select count(*)::integer
        from original_receipts o
        join requests r on r.id=o.request_id
        where o.state='outstanding' and r.payment_state='paid'
      ) as paid_receipt_gaps,
      (
        select count(*)::integer
        from payable_obligations o
        where o.state='allocated'
          and not exists (
            select 1
            from payment_items i
            join payment_batches b on b.id=i.batch_id
            where i.obligation_id=o.id
              and i.active
              and b.status='ready'
          )
      ) as allocated_orphans,
      (
        select count(*)::integer
        from payable_obligations o
        where o.state='paid'
          and not exists (
            select 1
            from payment_items i
            join payment_batches b on b.id=i.batch_id
            where i.obligation_id=o.id
              and i.active
              and b.status='paid'
          )
      ) as paid_orphans,
      (
        select count(*)::integer
        from payroll_cycles c
        where c.state='open'
          and c.cutoff_at <= now()
          and exists (
            select 1 from payroll_items i
            where i.cycle_month=c.month and i.state='queued'
          )
      ) as payroll_past_cutoff,
      (
        select count(*)::integer
        from export_jobs
        where state='failed'
          and created_at >= now() - interval '30 days'
      ) as failed_exports
  `;

  const issueRows = await db()`
    select * from (
      select
        'settlement:' || s.id::text as id,
        'blocking'::text as severity,
        r.reference || ' · Settlement เกินกำหนด' as title,
        e.display_name || ' · ครบกำหนด ' || s.due_date::text as detail,
        '/finance/settlements'::text as href,
        s.due_date::timestamptz as sort_at
      from settlements s
      join requests r on r.id=s.trip_id
      join employees e on e.id=s.owner_id
      where s.state in ('submitted','refund_due','top_up_due')
        and s.due_date < (now() at time zone 'Asia/Bangkok')::date

      union all

      select
        'receipt:' || r.id::text,
        'review'::text,
        r.reference || ' · จ่ายแล้วแต่ยังรอใบเสร็จต้นฉบับ',
        e.display_name || ' · ' || r.title,
        '/finance/receipts'::text,
        r.updated_at
      from original_receipts o
      join requests r on r.id=o.request_id
      join employees e on e.id=r.employee_id
      where o.state='outstanding' and r.payment_state='paid'

      union all

      select
        'allocated-orphan:' || o.id::text,
        'blocking'::text,
        'พบ Payable allocated ที่ไม่มีชุดจ่าย active',
        'Payable ' || left(o.id::text,8) || ' ต้อง reconcile ก่อนปิดงวด',
        '/finance/payments'::text,
        coalesce(o.paid_at,now())
      from payable_obligations o
      where o.state='allocated'
        and not exists (
          select 1
          from payment_items i
          join payment_batches b on b.id=i.batch_id
          where i.obligation_id=o.id and i.active and b.status='ready'
        )

      union all

      select
        'paid-orphan:' || o.id::text,
        'blocking'::text,
        'พบ Payable paid ที่ไม่มีชุดจ่าย paid',
        'Payable ' || left(o.id::text,8) || ' ต้องตรวจสอบหลักฐานการจ่าย',
        '/finance/payments'::text,
        coalesce(o.paid_at,now())
      from payable_obligations o
      where o.state='paid'
        and not exists (
          select 1
          from payment_items i
          join payment_batches b on b.id=i.batch_id
          where i.obligation_id=o.id and i.active and b.status='paid'
        )

      union all

      select
        'payroll:' || c.month,
        'review'::text,
        'Payroll ' || c.month || ' ผ่าน cutoff แล้วยังเปิดอยู่',
        'ยังมี OT queued ในรอบที่ถึง cutoff แล้ว',
        '/finance/payroll'::text,
        c.cutoff_at
      from payroll_cycles c
      where c.state='open'
        and c.cutoff_at <= now()
        and exists (
          select 1 from payroll_items i
          where i.cycle_month=c.month and i.state='queued'
        )

      union all

      select
        'export:' || j.id::text,
        'review'::text,
        'Export ล้มเหลว: ' || j.adapter,
        coalesce(j.blocked_reason,'ตรวจสอบ export job และสร้างใหม่หลังแก้สาเหตุ'),
        '/finance/exports'::text,
        j.created_at
      from export_jobs j
      where j.state='failed'
        and j.created_at >= now() - interval '30 days'
    ) issues
    order by case severity when 'blocking' then 0 else 1 end, sort_at desc
    limit 100
  `;

  return {
    overdueSettlements: Number(counts?.overdue_settlements ?? 0),
    paidReceiptGaps: Number(counts?.paid_receipt_gaps ?? 0),
    allocatedOrphans: Number(counts?.allocated_orphans ?? 0),
    paidOrphans: Number(counts?.paid_orphans ?? 0),
    payrollPastCutoff: Number(counts?.payroll_past_cutoff ?? 0),
    failedExports: Number(counts?.failed_exports ?? 0),
    issues: issueRows.map((row) => ({
      id: String(row.id),
      severity: row.severity as ReconciliationSeverity,
      title: String(row.title),
      detail: String(row.detail),
      href: String(row.href),
    })),
  };
}
