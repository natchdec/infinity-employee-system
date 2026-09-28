import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bangkokDate } from '../domain/calendar';
import { fingerprint, invariant, requireRole, type Actor, type Json } from '../domain/core';
import { calendarPolicySchema, dateSchema } from '../domain/policy';
import { audit, command, db, safeJson } from './db';

export const calendarPolicyPublishSchema = z
  .object({
    effectiveFrom: dateSchema,
    workingWeekdays: calendarPolicySchema.shape.workingWeekdays,
    holidays: calendarPolicySchema.shape.holidays,
    workStart: calendarPolicySchema.shape.workStart.unwrap(),
    workEnd: calendarPolicySchema.shape.workEnd.unwrap(),
    lunchStart: calendarPolicySchema.shape.lunchStart.unwrap().nullable(),
    lunchEnd: calendarPolicySchema.shape.lunchEnd.unwrap().nullable(),
    timeZone: z.literal('Asia/Bangkok'),
  })
  .strict();

export interface CalendarPolicyAdminView {
  version: number;
  effectiveFrom: string;
  body: z.infer<typeof calendarPolicySchema>;
  hash: string;
}

export function normalizeCalendarPolicyBody(input: z.infer<typeof calendarPolicyPublishSchema>) {
  return calendarPolicySchema.parse({
    workingWeekdays: [...input.workingWeekdays].sort((a, b) => a - b),
    holidays: [...new Set(input.holidays)].sort(),
    workStart: input.workStart,
    workEnd: input.workEnd,
    ...(input.lunchStart ? { lunchStart: input.lunchStart } : {}),
    ...(input.lunchEnd ? { lunchEnd: input.lunchEnd } : {}),
    timeZone: input.timeZone,
  });
}

export function currentCalendarPolicy(
  history: readonly CalendarPolicyAdminView[],
  today: string,
): CalendarPolicyAdminView | null {
  dateSchema.parse(today);
  return history.find((row) => row.effectiveFrom <= today) ?? null;
}

export async function calendarPolicyAdminState(
  now = new Date(),
): Promise<{ current: CalendarPolicyAdminView | null; history: CalendarPolicyAdminView[] }> {
  const today = bangkokDate(now);
  const rows = await db()`
    select version,effective_from::text,body,body_hash
    from policy_versions
    where family='calendar' and status='published'
    order by effective_from desc,version desc
  `;
  const history = rows.map((row) => ({
    version: Number(row.version),
    effectiveFrom: String(row.effective_from),
    body: calendarPolicySchema.parse(row.body),
    hash: String(row.body_hash),
  }));
  return {
    current: currentCalendarPolicy(history, today),
    history,
  };
}

export async function publishCalendarPolicy(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
): Promise<Json> {
  requireRole(actor, 'admin');
  const input = calendarPolicyPublishSchema.parse(raw);
  const today = bangkokDate(now);
  invariant(
    input.effectiveFrom >= today,
    'POLICY_BACKDATE_FORBIDDEN',
    'Working Schedule ใหม่ต้องมีผลตั้งแต่วันนี้หรืออนาคต',
    409,
  );
  const body = normalizeCalendarPolicyBody(input);
  const hash = fingerprint(body);

  return command(actor, 'admin.policy.calendar.publish', idempotencyKey, input, async (tx) => {
    const [boundary] = await tx`
      select id from policy_versions
      where family='calendar'
        and status='published'
        and effective_from=${input.effectiveFrom}::date
      limit 1
      for update
    `;
    invariant(
      !boundary,
      'POLICY_EFFECTIVE_DATE_EXISTS',
      'มี Working Schedule ที่เริ่มใช้ในวันนี้อยู่แล้ว กรุณาเลือก Effective Date ใหม่',
      409,
    );

    const [latest] = await tx`
      select version from policy_versions
      where family='calendar'
      order by version desc
      limit 1
      for update
    `;
    const version = Number(latest?.version ?? 0) + 1;
    const [created] = await tx`
      insert into policy_versions(
        family,version,effective_from,status,body,body_hash,legal_references,created_by,published_at
      )
      values(
        'calendar',${version},${input.effectiveFrom}::date,'published',
        ${tx.json(safeJson(body))},${hash},'[]'::jsonb,${actor.id},${now}
      )
      returning id,version,effective_from::text
    `;

    await audit(
      tx,
      actor,
      'admin.calendar_policy_published',
      'policy_version',
      String(created!.id),
      version,
      safeJson({
        family: 'calendar',
        effectiveFrom: input.effectiveFrom,
        workingWeekdays: body.workingWeekdays,
        holidays: body.holidays,
        workStart: body.workStart,
        workEnd: body.workEnd,
        lunchStart: body.lunchStart ?? null,
        lunchEnd: body.lunchEnd ?? null,
        timeZone: body.timeZone,
      }),
      correlationId,
    );

    return safeJson({
      id: created!.id,
      family: 'calendar',
      version,
      effectiveFrom: created!.effective_from,
      body,
      hash,
    });
  });
}
