import { randomUUID } from 'node:crypto';
import { type Calendar } from '../domain/calendar';
import { DomainError, fingerprint, invariant, type Actor, type Json } from '../domain/core';
import {
  classifyCalendarEvent,
  type CalendarWorkEvent,
  type WorklogSuggestion,
} from '../domain/worklog';
import { sourceChangeTransition, type WorklogReviewState } from '../domain/worklog-review';
import { config } from './config';
import { audit, db, policyFor, safeJson, type Transaction } from './db';
import { calendarSyncWindow, shouldResetCalendarDelta } from './integrations/outlook-calendar';
import { parseCalendarDeltaPage, safeGraphDeltaLink } from './integrations/outlook-calendar-parser';
import { initialCalendarDeltaUrl } from './integrations/outlook-graph';
import { outlookGraphJson } from './integrations/outlook-auth';

type WorklogIntent = 'ot' | 'onsite' | 'leave';

interface ExistingWorklogRow {
  id: string;
  intent: WorklogIntent;
  state: WorklogReviewState;
  sourceChangeKey: string;
  sourcePayloadHash: string;
  revision: number;
  draftPayload: Record<string, unknown>;
}

export interface CalendarSyncResult {
  employeeId: string;
  pages: number;
  sourceEvents: number;
  suggestions: number;
  removedEvents: number;
  deltaStored: boolean;
  deltaReset: boolean;
}

function localInstant(value: string): Date {
  const parsed = new Date(`${value}+07:00`);
  invariant(
    Number.isFinite(parsed.getTime()),
    'CALENDAR_RESPONSE_INVALID',
    'เวลา Calendar ไม่ถูกต้อง',
    503,
  );
  return parsed;
}

function safeSubject(value: string): string {
  const trimmed = value.trim();
  return (trimmed || 'Outlook Calendar').slice(0, 200);
}

function sourceHash(event: CalendarWorkEvent): string {
  return fingerprint({
    eventId: event.eventId,
    occurrenceId: event.occurrenceId,
    changeKey: event.changeKey,
    subject: event.subject,
    categories: [...event.categories].sort(),
    localStart: event.localStart,
    localEnd: event.localEnd,
    isAllDay: event.isAllDay,
    locationLabel: event.locationLabel,
    cancelled: event.cancelled === true,
  });
}

function draftFor(event: CalendarWorkEvent, suggestion: WorklogSuggestion): Record<string, Json> {
  return safeJson({
    source: {
      localStart: event.localStart,
      localEnd: event.localEnd,
      isAllDay: event.isAllDay,
    },
    suggestion,
  }) as Record<string, Json>;
}

function normalizeSuggestions(suggestions: WorklogSuggestion[]): WorklogSuggestion[] {
  const byIntent = new Map<WorklogIntent, WorklogSuggestion[]>();
  for (const suggestion of suggestions) {
    const list = byIntent.get(suggestion.intent) ?? [];
    list.push(suggestion);
    byIntent.set(suggestion.intent, list);
  }

  const result: WorklogSuggestion[] = [];
  for (const [intent, items] of byIntent) {
    if (items.length === 1) {
      result.push(items[0]!);
      continue;
    }
    const first = items[0]!;
    if (intent === 'leave' && first.intent === 'leave') {
      result.push({
        ...first,
        status: 'exception',
        exceptionCode: 'LEAVE_CATEGORY_AMBIGUOUS',
      });
      continue;
    }
    result.push(first);
  }
  return result;
}

async function existingForEvent(
  tx: Transaction,
  employeeId: string,
  eventId: string,
): Promise<Map<WorklogIntent, ExistingWorklogRow>> {
  const rows = await tx`
    select id,intent,state,source_change_key,source_payload_hash,revision,draft_payload
    from worklog_items
    where employee_id=${employeeId}
      and source_type='outlook'
      and external_event_id=${eventId}
    for update
  `;
  return new Map(
    rows.map((row) => [
      row.intent as WorklogIntent,
      {
        id: String(row.id),
        intent: row.intent as WorklogIntent,
        state: row.state as WorklogReviewState,
        sourceChangeKey: String(row.source_change_key),
        sourcePayloadHash: String(row.source_payload_hash),
        revision: Number(row.revision),
        draftPayload: row.draft_payload as Record<string, unknown>,
      },
    ]),
  );
}

async function disableWorklog(
  tx: Transaction,
  row: ExistingWorklogRow,
  exceptionCode: 'SOURCE_EVENT_CANCELLED' | 'IES_CATEGORY_REMOVED',
  now: Date,
): Promise<void> {
  if (row.state === 'submitted') {
    await tx`
      update worklog_items
      set exception_code='SOURCE_CHANGED_AFTER_SUBMIT',
          source_changed_after_confirmation=true,
          revision=revision+1,
          updated_at=${now}
      where id=${row.id}
    `;
    return;
  }

  await tx`
    update worklog_items
    set state='cancelled',
        exception_code=${exceptionCode},
        source_changed_after_confirmation=${row.state === 'confirmed'},
        revision=revision+1,
        updated_at=${now}
    where id=${row.id}
  `;
}

async function applyEvent(
  tx: Transaction,
  employeeId: string,
  event: CalendarWorkEvent,
  now: Date,
): Promise<number> {
  const date = event.localStart.slice(0, 10);
  const calendar = await policyFor<Calendar>(tx, 'calendar', date);
  const suggestions = normalizeSuggestions(classifyCalendarEvent(event, calendar.body));
  const existing = await existingForEvent(tx, employeeId, event.eventId);
  const hash = sourceHash(event);
  const seen = new Set<WorklogIntent>();
  let changed = 0;

  for (const suggestion of suggestions) {
    seen.add(suggestion.intent);
    const current = existing.get(suggestion.intent);
    const draft = draftFor(event, suggestion);
    const startAt = localInstant(event.localStart);
    const endAt = localInstant(event.localEnd);
    const leaveTypeId = suggestion.intent === 'leave' ? suggestion.leaveTypeId : null;
    const subject = safeSubject(event.subject);

    if (!current) {
      await tx`
        insert into worklog_items(
          employee_id,source_type,external_event_id,external_occurrence_id,
          source_change_key,subject,start_at,end_at,is_all_day,location_label,
          intent,leave_type_id,source_payload_hash,draft_payload,state,exception_code,
          source_changed_after_confirmation,revision,created_at,updated_at
        )
        values(
          ${employeeId},'outlook',${event.eventId},${event.occurrenceId},
          ${event.changeKey},${subject},${startAt},${endAt},${event.isAllDay},
          ${event.locationLabel},${suggestion.intent},${leaveTypeId},${hash},
          ${tx.json(draft)},${suggestion.status},${suggestion.exceptionCode},
          false,1,${now},${now}
        )
        on conflict(employee_id,source_type,external_event_id,external_occurrence_id,intent)
        do nothing
      `;
      changed++;
      continue;
    }

    if (current.sourcePayloadHash === hash) continue;

    const transition = sourceChangeTransition(current.state, true);
    if (current.state === 'submitted') {
      await tx`
        update worklog_items
        set source_change_key=${event.changeKey},
            source_payload_hash=${hash},
            subject=${subject},
            start_at=${startAt},
            end_at=${endAt},
            is_all_day=${event.isAllDay},
            location_label=${event.locationLabel},
            exception_code=${transition.exceptionCode},
            source_changed_after_confirmation=true,
            revision=revision+1,
            updated_at=${now}
        where id=${current.id}
      `;
      changed++;
      continue;
    }

    const nextState =
      current.state === 'confirmed'
        ? transition.state
        : current.state === 'ignored'
          ? 'ignored'
          : suggestion.status;
    const nextException =
      current.state === 'confirmed'
        ? transition.exceptionCode
        : current.state === 'ignored'
          ? null
          : suggestion.exceptionCode;

    await tx`
      update worklog_items
      set source_change_key=${event.changeKey},
          source_payload_hash=${hash},
          subject=${subject},
          start_at=${startAt},
          end_at=${endAt},
          is_all_day=${event.isAllDay},
          location_label=${event.locationLabel},
          leave_type_id=${leaveTypeId},
          draft_payload=${tx.json(draft)},
          state=${nextState},
          exception_code=${nextException},
          source_changed_after_confirmation=${current.state === 'confirmed'},
          confirmed_by=case when ${current.state === 'confirmed'} then null else confirmed_by end,
          confirmed_at=case when ${current.state === 'confirmed'} then null else confirmed_at end,
          revision=revision+1,
          updated_at=${now}
      where id=${current.id}
    `;
    changed++;
  }

  for (const row of existing.values()) {
    if (!seen.has(row.intent)) {
      await disableWorklog(tx, row, 'IES_CATEGORY_REMOVED', now);
      changed++;
    }
  }
  return changed;
}

async function applyRemovedEvent(
  tx: Transaction,
  employeeId: string,
  eventId: string,
  now: Date,
): Promise<number> {
  const existing = await existingForEvent(tx, employeeId, eventId);
  for (const row of existing.values()) {
    await disableWorklog(tx, row, 'SOURCE_EVENT_CANCELLED', now);
  }
  return existing.size;
}

function errorCode(error: unknown): string {
  if (error instanceof DomainError) return error.code.slice(0, 120);
  return 'OUTLOOK_CALENDAR_SYNC_FAILED';
}

async function recordSyncError(employeeId: string, code: string, now: Date): Promise<void> {
  await db()`
    insert into calendar_sync_states(
      employee_id,provider,last_error_code,revision,updated_at
    )
    values(${employeeId},'outlook',${code},1,${now})
    on conflict(employee_id)
    do update set
      last_error_code=excluded.last_error_code,
      revision=calendar_sync_states.revision+1,
      updated_at=excluded.updated_at
  `;
}

export async function syncEmployeeOutlookCalendar(
  employeeId: string,
  now = new Date(),
  auditActor: Actor | null = null,
  correlationId: string = randomUUID(),
): Promise<CalendarSyncResult> {
  invariant(
    config().OUTLOOK_CALENDAR_SYNC_ENABLED,
    'OUTLOOK_CALENDAR_NOT_CONFIGURED',
    'Outlook Calendar sync ยังไม่ได้เปิดใช้งาน',
    503,
  );
  const [employee] = await db()`
    select id,email,active
    from employees
    where id=${employeeId}
  `;
  invariant(
    employee && employee.active,
    'EMPLOYEE_NOT_AVAILABLE',
    'ไม่พบพนักงานที่เปิดใช้งาน',
    404,
  );

  const expected = calendarSyncWindow(now);
  const [syncState] = await db()`
    select delta_link,window_start::text,window_end::text
    from calendar_sync_states
    where employee_id=${employeeId}
  `;

  const storedDeltaLink =
    syncState?.delta_link &&
    !shouldResetCalendarDelta(syncState.window_start, syncState.window_end, expected)
      ? String(syncState.delta_link)
      : null;
  const storedDeltaUsable = Boolean(storedDeltaLink);
  let nextUrl = storedDeltaLink
    ? safeGraphDeltaLink(storedDeltaLink)
    : initialCalendarDeltaUrl(String(employee.email), expected);

  let pages = 0;
  let sourceEvents = 0;
  let suggestions = 0;
  let removedEvents = 0;
  let finalDelta: string | null = null;
  let deltaReset = false;

  try {
    while (nextUrl) {
      invariant(
        ++pages <= 50,
        'OUTLOOK_CALENDAR_PAGE_LIMIT',
        'Calendar sync มีจำนวนหน้ามากเกินไป',
        503,
      );
      let payload: unknown;
      try {
        payload = await outlookGraphJson(nextUrl);
      } catch (error) {
        if (
          storedDeltaUsable &&
          !deltaReset &&
          error instanceof DomainError &&
          error.code === 'OUTLOOK_CALENDAR_GRAPH_FAILED'
        ) {
          deltaReset = true;
          nextUrl = initialCalendarDeltaUrl(String(employee.email), expected);
          pages = 0;
          sourceEvents = 0;
          suggestions = 0;
          removedEvents = 0;
          finalDelta = null;
          continue;
        }
        throw error;
      }
      const page = parseCalendarDeltaPage(payload);
      sourceEvents += page.events.length;
      removedEvents += page.removedEventIds.length;

      const applied = await db().begin(async (tx) => {
        let count = 0;
        for (const event of page.events) {
          count += await applyEvent(tx, employeeId, event, now);
        }
        for (const eventId of page.removedEventIds) {
          count += await applyRemovedEvent(tx, employeeId, eventId, now);
        }
        return count;
      });
      suggestions += Number(applied);

      if (page.nextLink) {
        nextUrl = safeGraphDeltaLink(page.nextLink);
      } else {
        finalDelta = page.deltaLink ? safeGraphDeltaLink(page.deltaLink) : null;
        nextUrl = '';
      }
    }

    invariant(
      finalDelta,
      'OUTLOOK_CALENDAR_DELTA_MISSING',
      'Microsoft Graph ไม่ส่ง delta token กลับมา',
      503,
    );

    await db().begin(async (tx) => {
      await tx`
        insert into calendar_sync_states(
          employee_id,provider,delta_link,window_start,window_end,last_success_at,
          last_error_code,revision,updated_at
        )
        values(
          ${employeeId},'outlook',${finalDelta},${expected.start}::date,${expected.end}::date,
          ${now},null,1,${now}
        )
        on conflict(employee_id)
        do update set
          delta_link=excluded.delta_link,
          window_start=excluded.window_start,
          window_end=excluded.window_end,
          last_success_at=excluded.last_success_at,
          last_error_code=null,
          revision=calendar_sync_states.revision+1,
          updated_at=excluded.updated_at
      `;
      await audit(
        tx,
        auditActor,
        'calendar.synced',
        'employee_calendar',
        employeeId,
        null,
        {
          pages,
          sourceEvents,
          suggestions,
          removedEvents,
          deltaReset,
          windowStart: expected.start,
          windowEnd: expected.end,
        },
        correlationId,
      );
    });

    return {
      employeeId,
      pages,
      sourceEvents,
      suggestions,
      removedEvents,
      deltaStored: true,
      deltaReset,
    };
  } catch (error) {
    await recordSyncError(employeeId, errorCode(error), now);
    throw error;
  }
}

export async function queueDueOutlookCalendarSyncs(now = new Date()): Promise<number> {
  const settings = config();
  if (!settings.OUTLOOK_CALENDAR_SYNC_ENABLED) return 0;

  const intervalMs = settings.OUTLOOK_CALENDAR_SYNC_INTERVAL_MINUTES * 60_000;
  const bucket = Math.floor(now.getTime() / intervalMs);
  const employees = await db()`
    select id
    from employees
    where active
    order by id
  `;

  let queued = 0;
  await db().begin(async (tx) => {
    for (const employee of employees) {
      const dedupeKey = `outlook-calendar-sync:${employee.id}:${bucket}`;
      const before = await tx`
        insert into jobs(kind,dedupe_key,payload,available_at)
        values(
          'outlook_calendar_sync',
          ${dedupeKey},
          ${tx.json({ employeeId: String(employee.id) })},
          ${now}
        )
        on conflict(dedupe_key) do nothing
        returning id
      `;
      if (before.length) queued++;
    }
  });
  return queued;
}

export async function enqueueManualOutlookCalendarSync(
  actor: Actor,
  idempotencyKey: string,
): Promise<{ queued: boolean; jobKey: string; jobId: string }> {
  invariant(actor.active, 'FORBIDDEN', 'บัญชีพนักงานไม่พร้อมใช้งาน', 403);
  invariant(
    config().OUTLOOK_CALENDAR_SYNC_ENABLED,
    'OUTLOOK_CALENDAR_NOT_CONFIGURED',
    'Outlook Calendar sync ยังไม่ได้เปิดใช้งาน',
    503,
  );
  const jobKey = `outlook-calendar-manual:${actor.id}:${idempotencyKey}`;
  return db().begin(async (tx) => {
    const inserted = await tx`
      insert into jobs(kind,dedupe_key,payload)
      values('outlook_calendar_sync',${jobKey},${tx.json({ employeeId: actor.id })})
      on conflict(dedupe_key) do nothing
      returning id
    `;
    const [job] = inserted.length
      ? inserted
      : await tx`
          select id
          from jobs
          where dedupe_key=${jobKey}
            and kind='outlook_calendar_sync'
            and payload->>'employeeId'=${actor.id}
          limit 1
        `;
    invariant(job, 'CALENDAR_SYNC_JOB_MISSING', 'ไม่พบงาน Sync ที่เพิ่งสร้าง', 500);
    return { queued: inserted.length > 0, jobKey, jobId: String(job.id) };
  });
}

export async function manualOutlookCalendarSyncStatus(
  actor: Actor,
  jobId: string,
): Promise<{
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked';
  attempts: number;
  result: Json | null;
  lastErrorCode: string | null;
}> {
  invariant(actor.active, 'FORBIDDEN', 'บัญชีพนักงานไม่พร้อมใช้งาน', 403);
  invariant(
    /^[0-9a-fA-F-]{36}$/.test(jobId),
    'CALENDAR_SYNC_JOB_INVALID',
    'รหัสงาน Sync ไม่ถูกต้อง',
    400,
  );
  const [job] = await db()`
    select state,attempts,result
    from jobs
    where id=${jobId}::uuid
      and kind='outlook_calendar_sync'
      and payload->>'employeeId'=${actor.id}
    limit 1
  `;
  invariant(job, 'CALENDAR_SYNC_JOB_NOT_FOUND', 'ไม่พบงาน Sync นี้', 404);
  const [syncState] = await db()`
    select last_error_code
    from calendar_sync_states
    where employee_id=${actor.id}
  `;
  return {
    state: job.state,
    attempts: Number(job.attempts),
    result: job.result ? safeJson(job.result) : null,
    lastErrorCode: syncState?.last_error_code ?? null,
  };
}
