import { nextMonth } from '../domain/calendar';
import { invariant } from '../domain/core';
import { detectWorklogConflicts } from '../domain/worklog-review';
import { db } from './db';

export interface WorklogListRow {
  id: string;
  subject: string;
  startAt: Date;
  endAt: Date;
  intent: 'ot' | 'onsite' | 'leave';
  locationLabel: string | null;
  state: string;
  exceptionCode: string | null;
  draftPayload: Record<string, unknown>;
  sourceChangedAfterConfirmation: boolean;
  revision: number;
}

export async function employeeWorklogRows(
  employeeId: string,
  month: string,
): Promise<WorklogListRow[]> {
  invariant(/^20\d{2}-(0[1-9]|1[0-2])$/.test(month), 'INVALID_MONTH', 'เดือนไม่ถูกต้อง');
  const start = `${month}-01`;
  const end = `${nextMonth(month)}-01`;
  const rows = await db()`
    select
      id, subject, start_at, end_at, intent, location_label, state,
      exception_code, draft_payload, source_changed_after_confirmation, revision,
      to_char(start_at at time zone 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') as local_start,
      to_char(end_at at time zone 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') as local_end
    from worklog_items
    where employee_id=${employeeId}
      and (start_at at time zone 'Asia/Bangkok')::date >= ${start}::date
      and (start_at at time zone 'Asia/Bangkok')::date < ${end}::date
    order by start_at, intent, id
  `;
  const items = rows.map((row) => ({
    id: String(row.id),
    subject: String(row.subject),
    startAt: new Date(row.start_at),
    endAt: new Date(row.end_at),
    intent: row.intent as WorklogListRow['intent'],
    locationLabel: row.location_label ?? null,
    state: String(row.state),
    exceptionCode: row.exception_code ?? null,
    draftPayload: row.draft_payload as Record<string, unknown>,
    sourceChangedAfterConfirmation: Boolean(row.source_changed_after_confirmation),
    revision: Number(row.revision),
  }));

  const reviewableRows = rows.filter((row) =>
    ['suggested', 'confirmed', 'exception'].includes(String(row.state)),
  );
  const conflicts = detectWorklogConflicts(
    reviewableRows.map((row) => ({
      id: String(row.id),
      intent: row.intent as WorklogListRow['intent'],
      localStart: String(row.local_start),
      localEnd: String(row.local_end),
      locationLabel: row.location_label ?? null,
    })),
  );
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const conflict of conflicts) {
    for (const id of conflict.itemIds) {
      const item = byId.get(id);
      if (!item) continue;
      if (!item.exceptionCode) item.exceptionCode = conflict.code;
      if (item.state === 'suggested' || item.state === 'confirmed') item.state = 'exception';
    }
  }
  return items;
}

export async function worklogSyncStatus(employeeId: string) {
  const [row] = await db()`
    select last_success_at, last_error_code, revision
    from calendar_sync_states
    where employee_id=${employeeId}
  `;
  return row
    ? {
        lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
        lastErrorCode: row.last_error_code ?? null,
        revision: Number(row.revision),
      }
    : null;
}
