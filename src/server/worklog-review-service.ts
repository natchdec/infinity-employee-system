import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bangkokDate } from '../domain/calendar';
import { invariant, requireRevision, type Actor, type Json } from '../domain/core';
import { planDailyOnsiteRoute } from '../domain/worklog-review';
import { audit, command, db, safeJson } from './db';

const reviewSchema = z
  .object({
    action: z.enum(['confirm', 'ignore']),
    expectedRevision: z.number().int().min(1),
  })
  .strict();

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export async function reviewWorklogItem(
  actor: Actor,
  id: string,
  raw: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
) {
  const input = reviewSchema.parse(raw);
  return command(actor, `worklog.review:${id}`, idempotencyKey, { id, ...input }, async (tx) => {
    const [row] = await tx`
      select id, employee_id, intent, state, revision, start_at, end_at, location_label
      from worklog_items
      where id=${id}
      for update
    `;
    invariant(row && row.employee_id === actor.id, 'NOT_FOUND', 'ไม่พบ Calendar Draft', 404);
    requireRevision(Number(row.revision), input.expectedRevision);

    const currentState = String(row.state);
    if (input.action === 'confirm') {
      invariant(
        currentState === 'suggested',
        'WORKLOG_NOT_CONFIRMABLE',
        'รายการนี้ต้องแก้ไขหรือไม่มีสถานะที่ยืนยันได้',
        409,
      );

      if (row.intent === 'ot') {
        const overlapping = await tx`
          select id
          from worklog_items
          where employee_id=${actor.id}
            and id<>${id}
            and intent='ot'
            and state in ('suggested','confirmed','exception')
            and start_at < ${row.end_at}
            and end_at > ${row.start_at}
          limit 1
        `;
        invariant(
          overlapping.length === 0,
          'WORKLOG_CONFLICT_REVIEW_REQUIRED',
          'พบ OT Calendar ซ้อนเวลา กรุณาตรวจและแก้ไขก่อนสร้างคำขอ',
          409,
        );
      }

      if (row.intent === 'onsite') {
        const sameDay = await tx`
          select id
          from worklog_items
          where employee_id=${actor.id}
            and id<>${id}
            and intent='onsite'
            and state in ('suggested','confirmed','exception')
            and (start_at at time zone 'Asia/Bangkok')::date =
                (${row.start_at}::timestamptz at time zone 'Asia/Bangkok')::date
          limit 1
        `;
        invariant(
          sameDay.length === 0,
          'WORKLOG_CONFLICT_REVIEW_REQUIRED',
          'พบ Onsite หลายจุดในวันเดียวกัน กรุณาตรวจ route chain ก่อนสร้างคำขอ',
          409,
        );
      }
    } else {
      invariant(
        ['suggested', 'confirmed', 'exception'].includes(currentState),
        'WORKLOG_NOT_IGNORABLE',
        'รายการนี้ไม่สามารถ Ignore ได้',
        409,
      );
    }

    const nextState = input.action === 'confirm' ? 'confirmed' : 'ignored';
    const [updated] = await tx`
      update worklog_items
      set state=${nextState},
          exception_code=case when ${input.action === 'ignore'} then null else exception_code end,
          source_changed_after_confirmation=case when ${input.action === 'ignore'} then false else source_changed_after_confirmation end,
          confirmed_by=${input.action === 'confirm' ? actor.id : null},
          confirmed_at=${input.action === 'confirm' ? now : null},
          revision=revision+1,
          updated_at=${now}
      where id=${id}
      returning revision
    `;

    await audit(
      tx,
      actor,
      `worklog.${input.action === 'confirm' ? 'confirmed' : 'ignored'}`,
      'worklog_item',
      id,
      Number(updated!.revision),
      { from: currentState, to: nextState },
      correlationId,
    );

    return {
      id,
      state: nextState,
      revision: Number(updated!.revision),
    } as Json;
  });
}

export interface WorklogSubmissionDraftSource {
  id: string;
  expectedRevision: number;
}

export interface WorklogRequestDraft {
  sourceWorklogId: string;
  sourceRevision: number;
  sourceWorklogs: WorklogSubmissionDraftSource[];
  state: string;
  kind: 'ot' | 'expense' | 'leave';
  initial: Record<string, Json>;
}

export async function worklogRequestDraft(actor: Actor, id: string): Promise<WorklogRequestDraft> {
  const [row] = await db()`
    select
      id, employee_id, subject, start_at, location_label, intent, state, revision,
      draft_payload
    from worklog_items
    where id=${id}
  `;
  invariant(row && row.employee_id === actor.id, 'NOT_FOUND', 'ไม่พบ Calendar Draft', 404);
  invariant(
    ['suggested', 'confirmed', 'exception'].includes(String(row.state)),
    'WORKLOG_NOT_SUBMITTABLE',
    'Calendar Draft นี้ไม่สามารถสร้างคำขอใหม่ได้',
    409,
  );

  const draft = objectValue(row.draft_payload);
  const source = objectValue(draft.source);
  const suggestion = objectValue(draft.suggestion);
  const subject = String(row.subject);
  const localDate =
    typeof source.localStart === 'string'
      ? source.localStart.slice(0, 10)
      : bangkokDate(new Date(row.start_at));
  const common = {
    title: subject,
    projectId: null,
    description: `สร้างจาก Outlook Calendar: ${subject}`,
  } satisfies Record<string, Json>;

  let kind: WorklogRequestDraft['kind'];
  let initial: Record<string, Json>;
  let sourceWorklogs: WorklogSubmissionDraftSource[] = [
    { id: String(row.id), expectedRevision: Number(row.revision) },
  ];

  if (row.intent === 'leave') {
    const start = typeof suggestion.start === 'string' ? suggestion.start : localDate;
    const end = typeof suggestion.end === 'string' ? suggestion.end : start;
    invariant(
      typeof suggestion.leaveTypeId === 'string' && suggestion.leaveTypeId.length > 0,
      'WORKLOG_DRAFT_INVALID',
      'Calendar Draft ไม่มีประเภทการลาที่ถูกต้อง',
      409,
    );
    kind = 'leave';
    initial = {
      ...common,
      typeId: suggestion.leaveTypeId,
      start,
      end,
      unit: 'full_day',
      documentIds: [],
    };
  } else if (row.intent === 'onsite') {
    const onsiteRows = await db()`
      select
        id, revision, location_label,
        to_char(start_at at time zone 'Asia/Bangkok','YYYY-MM-DD"T"HH24:MI:SS') as local_start
      from worklog_items
      where employee_id=${actor.id}
        and intent='onsite'
        and state in ('suggested','confirmed','exception')
        and (start_at at time zone 'Asia/Bangkok')::date=${localDate}::date
      order by start_at,id
    `;
    const route = planDailyOnsiteRoute(
      onsiteRows.map((item) => ({
        itemId: String(item.id),
        localStart: String(item.local_start),
        locationLabel: String(item.location_label ?? ''),
      })),
    );
    invariant(route, 'WORKLOG_DRAFT_INVALID', 'ไม่พบ Onsite route ที่สร้างคำขอได้', 409);

    const byId = new Map(
      onsiteRows.map((item) => [
        String(item.id),
        { id: String(item.id), expectedRevision: Number(item.revision) },
      ]),
    );
    sourceWorklogs = route.stops.map((stop) => byId.get(stop.itemId)!);

    const nodes: { kind: 'office' | 'customer'; label: string }[] = [
      { kind: 'office', label: 'สำนักงาน' },
      ...route.stops.map((stop) => ({ kind: 'customer' as const, label: stop.locationLabel })),
      { kind: 'office', label: 'สำนักงาน' },
    ];
    const mileage = nodes.slice(0, -1).map((node, index) => ({
      origin: node.kind,
      destination: nodes[index + 1]!.kind,
      originLabel: node.label,
      destinationLabel: nodes[index + 1]!.label,
      source: 'manual_attested',
    }));
    const routeLabel = route.stops.map((stop) => stop.locationLabel).join(' → ');

    kind = 'expense';
    initial = {
      ...common,
      title: route.stops.length > 1 ? `Onsite: ${routeLabel}` : subject,
      description:
        route.stops.length > 1
          ? `สร้างจาก Outlook Calendar route: สำนักงาน → ${routeLabel} → สำนักงาน`
          : common.description,
      lines: [
        {
          categoryId: 'mileage',
          date: route.date,
          description: route.stops.length > 1 ? `Onsite route: ${routeLabel}` : subject,
          documentIds: [],
          mileage,
        },
      ],
      calendarRouteNeedsReview: route.needsReview,
    };
  } else {
    const days = arrayValue(suggestion.days).map(objectValue);
    const firstDay = days[0] ?? {};
    const suggestedHours =
      typeof suggestion.totalSuggestedHours === 'number' &&
      Number.isFinite(suggestion.totalSuggestedHours)
        ? suggestion.totalSuggestedHours
        : 0;
    kind = 'ot';
    initial = {
      ...common,
      date: typeof firstDay.date === 'string' ? firstDay.date : localDate,
      task: subject,
      lines: [],
      calendarSuggestedHours: suggestedHours,
      calendarDayKind:
        firstDay.dayKind === 'holiday' || firstDay.dayKind === 'working'
          ? firstDay.dayKind
          : 'working',
    };
  }

  return {
    sourceWorklogId: String(row.id),
    sourceRevision: Number(row.revision),
    sourceWorklogs,
    state: String(row.state),
    kind,
    initial: safeJson(initial) as Record<string, Json>,
  };
}
