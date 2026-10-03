import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { invariant, type Actor, type Json } from '../domain/core';
import { audit, command, db, safeJson } from './db';

const homeAddressSchema = z
  .object({
    homeAddress: z.string().trim().min(5).max(500),
  })
  .strict();

export interface ProfileSettings {
  homeAddress: string | null;
}

export async function profileSettings(actor: Actor): Promise<ProfileSettings> {
  const [row] = await db()`
    select home_address
    from employees
    where id=${actor.id}
  `;
  invariant(row, 'EMPLOYEE_NOT_FOUND', 'ไม่พบข้อมูลพนักงาน', 404);
  return {
    homeAddress: row.home_address ? String(row.home_address) : null,
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
