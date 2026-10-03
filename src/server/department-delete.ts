import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { invariant, requireRole, type Actor, type Json } from '../domain/core';
import { audit, command, safeJson } from './db';

const inputSchema = z.object({ id: z.string().uuid() }).strict();

export async function deleteAdminDepartment(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  correlationId: string = randomUUID(),
): Promise<Json> {
  requireRole(actor, 'admin');
  const input = inputSchema.parse(raw);
  return command(
    actor,
    `admin.department.delete:${input.id}`,
    idempotencyKey,
    input,
    async (tx) => {
      const [current] =
        await tx`select id,code,name,active from departments where id=${input.id} for update`;
      invariant(current, 'DEPARTMENT_NOT_FOUND', 'ไม่พบแผนก', 404);
      const [usage] =
        await tx`select count(*)::integer as count from employees where department_id=${input.id}`;
      invariant(
        Number(usage?.count ?? 0) === 0,
        'DEPARTMENT_IN_USE',
        'ลบแผนกไม่ได้ เนื่องจากยังมีประวัติพนักงานอ้างอิงแผนกนี้',
        409,
      );
      await tx`delete from departments where id=${input.id}`;
      await audit(
        tx,
        actor,
        'admin.department_deleted',
        'department',
        input.id,
        null,
        safeJson({ code: current.code, name: current.name }),
        correlationId,
      );
      return safeJson({ id: input.id, code: current.code, deleted: true });
    },
  );
}
