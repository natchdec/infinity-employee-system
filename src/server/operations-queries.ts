import { bangkokDate } from '../domain/calendar';
import { detectWorklogConflicts } from '../domain/worklog-review';
import { db } from './db';

export interface NotificationRow {
  id: string;
  title: string;
  href: string;
  createdAt: Date;
  readAt: Date | null;
}

export async function employeeNotifications(employeeId: string): Promise<NotificationRow[]> {
  const rows = await db()`
    select id, title, href, created_at, read_at
    from notifications
    where employee_id=${employeeId}
    order by read_at nulls first, created_at desc, id desc
    limit 100
  `;
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    href: String(row.href),
    createdAt: new Date(row.created_at),
    readAt: row.read_at ? new Date(row.read_at) : null,
  }));
}

export interface ReceiptInboxRow {
  id: string;
  filename: string;
  mediaType: string;
  byteSize: number;
  uploadedAt: Date;
  usage: {
    requestId: string;
    reference: string;
    workflowState: string;
    line: number | null;
    categoryId: string | null;
    description: string | null;
  } | null;
}

export async function receiptInbox(employeeId: string): Promise<ReceiptInboxRow[]> {
  const rows = await db()`
    select
      d.id,
      d.filename,
      d.media_type,
      d.byte_size,
      d.uploaded_at,
      usage.request_id,
      usage.reference,
      usage.workflow_state,
      usage.expense_line,
      usage.category_id,
      usage.description
    from documents d
    left join lateral (
      select
        l.request_id,
        r.reference,
        r.workflow_state,
        l.expense_line,
        el.category_id,
        el.description
      from document_links l
      join requests r on r.id=l.request_id
      join request_revisions rr on rr.request_id=l.request_id and rr.round=l.round
      left join expense_lines el
        on el.request_id=l.request_id
       and el.round=l.round
       and el.line=l.expense_line
      where l.document_id=d.id
      order by rr.submitted_at desc
      limit 1
    ) usage on true
    where d.owner_id=${employeeId}
      and d.scan_state='clean'
      and d.evidence_class='expense'
    order by (usage.request_id is null) desc,d.uploaded_at desc,d.id desc
    limit 200
  `;
  return rows.map((row) => ({
    id: String(row.id),
    filename: String(row.filename),
    mediaType: String(row.media_type),
    byteSize: Number(row.byte_size),
    uploadedAt: new Date(row.uploaded_at),
    usage: row.request_id
      ? {
          requestId: String(row.request_id),
          reference: String(row.reference),
          workflowState: String(row.workflow_state),
          line: row.expense_line === null ? null : Number(row.expense_line),
          categoryId: row.category_id === null ? null : String(row.category_id),
          description: row.description === null ? null : String(row.description),
        }
      : null,
  }));
}

export async function unassignedReceiptInbox(employeeId: string): Promise<ReceiptInboxRow[]> {
  return (await receiptInbox(employeeId)).filter((row) => row.usage === null).slice(0, 100);
}

export interface ExceptionInboxRow {
  id: string;
  kind: 'calendar' | 'mileage' | 'receipt' | 'configuration';
  title: string;
  detail: string;
  href: string;
  severity: 'review' | 'blocking';
}

export async function employeeExceptionInbox(employeeId: string): Promise<ExceptionInboxRow[]> {
  const worklog = await db()`
    select id, subject, exception_code, source_changed_after_confirmation
    from worklog_items
    where employee_id=${employeeId}
      and (
        state='exception'
        or source_changed_after_confirmation
      )
    order by updated_at desc
    limit 100
  `;
  const reviewCandidates = await db()`
    select
      id, subject, intent, location_label,
      to_char(start_at at time zone 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') as local_start,
      to_char(end_at at time zone 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') as local_end
    from worklog_items
    where employee_id=${employeeId}
      and state in ('suggested','confirmed','exception')
    order by start_at desc,id
    limit 500
  `;
  const conflicts = detectWorklogConflicts(
    reviewCandidates.map((row) => ({
      id: String(row.id),
      intent: row.intent as 'ot' | 'onsite' | 'leave',
      localStart: String(row.local_start),
      localEnd: String(row.local_end),
      locationLabel: row.location_label ?? null,
    })),
  ).filter(
    (conflict) => conflict.code === 'OT_OVERLAP' || conflict.code === 'ONSITE_MULTI_STOP_REVIEW',
  );

  const receipts = await db()`
    select o.request_id, r.reference, r.title
    from original_receipts o
    join requests r on r.id=o.request_id
    where r.employee_id=${employeeId}
      and o.state='outstanding'
    order by r.updated_at desc
    limit 100
  `;

  const [calendarSync] = await db()`
    select last_error_code,last_success_at
    from calendar_sync_states
    where employee_id=${employeeId}
  `;

  const hasOnsite = reviewCandidates.some((row) => row.intent === 'onsite');
  let commuteMissing = false;
  if (hasOnsite) {
    const today = bangkokDate(new Date());
    const commute = await db()`
      select id
      from commute_versions
      where employee_id=${employeeId}
        and effective_from<=${today}::date
      order by effective_from desc
      limit 1
    `;
    commuteMissing = commute.length === 0;
  }

  const rows: ExceptionInboxRow[] = [
    ...worklog.map((row) => ({
      id: `calendar:${row.id}`,
      kind: 'calendar' as const,
      title: String(row.subject),
      detail: row.source_changed_after_confirmation
        ? 'Calendar ต้นทางเปลี่ยนหลังยืนยันหรือส่งคำขอ'
        : String(row.exception_code ?? 'Calendar ต้องตรวจสอบ'),
      href: '/worklog',
      severity: 'review' as const,
    })),
    ...conflicts.map((conflict) => ({
      id: `derived:${conflict.code}:${conflict.itemIds.join(':')}`,
      kind: (conflict.code === 'OT_OVERLAP' ? 'calendar' : 'mileage') as 'calendar' | 'mileage',
      title:
        conflict.code === 'OT_OVERLAP' ? 'OT Calendar ซ้อนเวลา' : 'Onsite หลายจุดในวันเดียวกัน',
      detail:
        conflict.code === 'OT_OVERLAP'
          ? 'ต้องตรวจช่วงเวลาที่ซ้อนกันก่อนสร้างคำขอ OT'
          : 'ต้องตรวจ route chain และระยะทางทุก leg ก่อนสร้าง Expense',
      href: '/worklog',
      severity: 'blocking' as const,
    })),
    ...(calendarSync?.last_error_code
      ? [
          {
            id: `configuration:calendar:${employeeId}`,
            kind: 'configuration' as const,
            title: 'Outlook Calendar sync ต้องตรวจสอบ',
            detail: String(calendarSync.last_error_code),
            href: '/worklog',
            severity: 'blocking' as const,
          },
        ]
      : []),
    ...(commuteMissing
      ? [
          {
            id: `configuration:commute:${employeeId}`,
            kind: 'configuration' as const,
            title: 'ยังไม่ได้กำหนดระยะทาง Home → Office',
            detail: 'ต้องมี Commute version ที่มีผลก่อนคำนวณ Mileage ที่เกี่ยวข้องกับบ้าน',
            href: '/profile',
            severity: 'blocking' as const,
          },
        ]
      : []),
    ...receipts.map((row) => ({
      id: `receipt:${row.request_id}`,
      kind: 'receipt' as const,
      title: `${row.reference} · ${row.title}`,
      detail: 'ยังรอใบเสร็จต้นฉบับ',
      href: `/requests/${row.request_id}`,
      severity: 'review' as const,
    })),
  ];
  return rows.sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === 'blocking' ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
}

export interface MonthlyPeriodRow {
  month: string;
  family: 'payroll' | 'claims';
  state: 'open' | 'closing' | 'locked';
  revision: number;
  changedAt: Date;
  lockedAt: Date | null;
}

export async function monthlyOperationalPeriods(limit = 24): Promise<MonthlyPeriodRow[]> {
  const rows = await db()`
    select month, family, state, revision, changed_at, locked_at
    from monthly_operational_periods
    order by month desc, family
    limit ${limit}
  `;
  return rows.map((row) => ({
    month: String(row.month),
    family: row.family as MonthlyPeriodRow['family'],
    state: row.state as MonthlyPeriodRow['state'],
    revision: Number(row.revision),
    changedAt: new Date(row.changed_at),
    lockedAt: row.locked_at ? new Date(row.locked_at) : null,
  }));
}
