import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bangkokDate } from '../domain/calendar';
import { invariant, type Actor, type Json } from '../domain/core';
import { audit, command, db, safeJson } from './db';

const homeAddressSchema = z
  .object({
    homeAddress: z.string().trim().min(5).max(500),
  })
  .strict();

const commuteDistanceSchema = z
  .object({
    distanceMetres: z.number().int().min(0).max(500_000),
  })
  .strict();

export interface ProfileSettings {
  homeAddress: string | null;
  commuteDistanceMetres: number | null;
  commuteEffectiveFrom: string | null;
}

export async function profileSettings(actor: Actor, now = new Date()): Promise<ProfileSettings> {
  const today = bangkokDate(now);
  const [row] = await db()`
    select
      e.home_address,
      commute.distance_metres,
      commute.effective_from::text
    from employees e
    left join lateral (
      select distance_metres,effective_from
      from commute_versions
      where employee_id=e.id
        and effective_from<=${today}::date
      order by effective_from desc
      limit 1
    ) commute on true
    where e.id=${actor.id}
  `;
  invariant(row, 'EMPLOYEE_NOT_FOUND', 'ไม่พบข้อมูลพนักงาน', 404);
  return {
    homeAddress: row.home_address ? String(row.home_address) : null,
    commuteDistanceMetres:
      row.distance_metres === null || row.distance_metres === undefined
        ? null
        : Number(row.distance_metres),
    commuteEffectiveFrom: row.effective_from ? String(row.effective_from) : null,
  };
}

export async function updateProfileHomeAddress(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  correlationId: string = randomUUID(),
): Promise<Json> {
  invariant(actor.active, 'FORBIDDEN', 'บัญชีพนักงานไม่พร้อมใช้งาน', 403);
  const input = homeAddressSchema.parse(raw);
  return command(actor, 'profile.home_address', idempotencyKey, input, async (tx) => {
    const [row] = await tx`
      update employees
      set home_address=${input.homeAddress}
      where id=${actor.id}
      returning home_address
    `;
    invariant(row, 'EMPLOYEE_NOT_FOUND', 'ไม่พบข้อมูลพนักงาน', 404);
    await audit(
      tx,
      actor,
      'profile.home_address_updated',
      'employee',
      actor.id,
      null,
      safeJson({ configured: true }),
      correlationId,
    );
    return safeJson({ homeAddress: row.home_address });
  });
}

export async function updateProfileCommuteDistance(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  correlationId: string = randomUUID(),
  now = new Date(),
): Promise<Json> {
  invariant(actor.active, 'FORBIDDEN', 'บัญชีพนักงานไม่พร้อมใช้งาน', 403);
  const input = commuteDistanceSchema.parse(raw);
  const today = bangkokDate(now);
  return command(
    actor,
    'profile.commute_distance',
    idempotencyKey,
    { ...input, effectiveFrom: today },
    async (tx) => {
      const [employee] = await tx`
        select home_address
        from employees
        where id=${actor.id}
        for update
      `;
      invariant(employee, 'EMPLOYEE_NOT_FOUND', 'ไม่พบข้อมูลพนักงาน', 404);
      invariant(
        employee.home_address && String(employee.home_address).trim().length >= 5,
        'HOME_ADDRESS_REQUIRED',
        'กรุณาบันทึก Home Address ก่อนกำหนดระยะทาง Home → Office',
        409,
      );

      const [current] = await tx`
        select distance_metres,effective_from::text
        from commute_versions
        where employee_id=${actor.id}
          and effective_from<=${today}::date
        order by effective_from desc
        limit 1
      `;
      if (current?.effective_from === today) {
        invariant(
          Number(current.distance_metres) === input.distanceMetres,
          'COMMUTE_VERSION_TODAY_EXISTS',
          'วันนี้มี Commute version แล้ว การเปลี่ยนระยะทางใหม่ต้องเริ่มในวันถัดไปเพื่อรักษาประวัติ',
          409,
        );
        return safeJson({
          distanceMetres: Number(current.distance_metres),
          effectiveFrom: String(current.effective_from),
        });
      }

      const [row] = await tx`
        insert into commute_versions(
          employee_id,effective_from,distance_metres,verified_by
        )
        values(
          ${actor.id},${today}::date,${input.distanceMetres},${actor.id}
        )
        returning distance_metres,effective_from::text
      `;
      invariant(row, 'COMMUTE_VERSION_NOT_SAVED', 'บันทึกระยะทางมาตรฐานไม่สำเร็จ', 500);
      await audit(
        tx,
        actor,
        'profile.commute_distance_attested',
        'employee',
        actor.id,
        null,
        safeJson({
          distanceMetres: Number(row.distance_metres),
          effectiveFrom: String(row.effective_from),
          source: 'employee_attested',
        }),
        correlationId,
      );
      return safeJson({
        distanceMetres: Number(row.distance_metres),
        effectiveFrom: String(row.effective_from),
      });
    },
  );
}
