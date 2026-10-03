import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { invariant, requireRole, type Actor, type Json } from '../domain/core';
import { audit, command, safeJson } from './db';
import { config } from './config';

const directoryReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ignore') }).strict(),
  z.object({ action: z.literal('unignore') }).strict(),
  z
    .object({
      action: z.literal('create_employee'),
      departmentId: z.string().uuid(),
      hireDate: z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),
    })
    .strict(),
]);

function normalizedEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function reviewMicrosoftDirectoryAccount(
  actor: Actor,
  objectId: string,
  raw: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
): Promise<Json> {
  requireRole(actor, 'admin');
  invariant(
    z.string().uuid().safeParse(objectId).success,
    'DIRECTORY_ACCOUNT_INVALID',
    'บัญชี Directory ไม่ถูกต้อง',
  );
  const input = directoryReviewSchema.parse(raw);
  const tenantId = config().OUTLOOK_CALENDAR_TENANT_ID;
  invariant(
    tenantId,
    'MICROSOFT_DIRECTORY_NOT_CONFIGURED',
    'Microsoft 365 Directory sync ยังไม่ได้เปิดใช้งาน',
    503,
  );

  return command(
    actor,
    `admin.directory_account:${objectId}`,
    idempotencyKey,
    { objectId, ...input },
    async (tx) => {
      const [account] = await tx`
        select tenant_id,entra_object_id,user_principal_name,email,display_name,
          account_enabled,user_type,linked_employee_id,review_state
        from microsoft_directory_accounts
        where tenant_id=${tenantId}::uuid and entra_object_id=${objectId}::uuid
        for update
      `;
      invariant(account, 'DIRECTORY_ACCOUNT_NOT_FOUND', 'ไม่พบบัญชี Microsoft 365', 404);

      if (input.action === 'ignore' || input.action === 'unignore') {
        invariant(
          !account.linked_employee_id,
          'DIRECTORY_ACCOUNT_LINKED',
          'บัญชีนี้ผูกกับ Employee แล้ว ให้ปิดใช้งานจากหน้าพนักงานแทน',
          409,
        );
        const reviewState = input.action === 'ignore' ? 'ignored' : 'unreviewed';
        await tx`
          update microsoft_directory_accounts
          set review_state=${reviewState},reviewed_by=${actor.id},reviewed_at=${now}
          where tenant_id=${tenantId}::uuid and entra_object_id=${objectId}::uuid
        `;
        await audit(
          tx,
          actor,
          input.action === 'ignore'
            ? 'microsoft_directory.account_ignored'
            : 'microsoft_directory.account_review_reopened',
          'microsoft_directory_account',
          objectId,
          null,
          safeJson({ reviewState }),
          correlationId,
        );
        return safeJson({ objectId, reviewState, linkedEmployeeId: null });
      }

      invariant(
        !account.linked_employee_id,
        'DIRECTORY_ACCOUNT_LINKED',
        'บัญชีนี้เป็น Employee อยู่แล้ว',
        409,
      );
      invariant(
        account.account_enabled,
        'DIRECTORY_ACCOUNT_DISABLED',
        'บัญชี Microsoft 365 นี้ปิดใช้งานอยู่',
        409,
      );
      invariant(
        String(account.user_type ?? '').toLowerCase() === 'member',
        'DIRECTORY_MEMBER_REQUIRED',
        'เพิ่มเป็นพนักงานได้เฉพาะ Microsoft 365 Member',
        409,
      );
      const email =
        normalizedEmail(account.email ? String(account.email) : null) ??
        normalizedEmail(String(account.user_principal_name));
      invariant(
        email,
        'DIRECTORY_EMAIL_REQUIRED',
        'บัญชีนี้ไม่มีอีเมลที่ใช้เป็น Employee identity ได้',
        409,
      );

      const [department] = await tx`
        select id from departments where id=${input.departmentId} and active for update
      `;
      invariant(department, 'DEPARTMENT_NOT_AVAILABLE', 'แผนกนี้ไม่เปิดใช้งานแล้ว', 409);

      const existing = await tx`
        select id from employees
        where tenant_id=${tenantId}::uuid
          and (entra_object_id=${objectId}::uuid or email=${email})
        limit 1
        for update
      `;
      invariant(
        !existing.length,
        'EMPLOYEE_IDENTITY_EXISTS',
        'มี Employee ที่ใช้ identity หรืออีเมลนี้อยู่แล้ว',
        409,
      );

      const [employee] = await tx`
        insert into employees(
          tenant_id,entra_object_id,email,display_name,department_id,hire_date,active,is_head_owner
        )
        values(
          ${tenantId}::uuid,${objectId}::uuid,${email},${String(account.display_name)},
          ${input.departmentId},${input.hireDate}::date,true,false
        )
        returning id
      `;
      invariant(employee, 'EMPLOYEE_CREATE_FAILED', 'สร้าง Employee ไม่สำเร็จ', 500);
      await tx`insert into employee_roles(employee_id,role) values(${employee.id},'employee')`;
      await tx`
        update microsoft_directory_accounts
        set linked_employee_id=${employee.id},review_state='employee',
          reviewed_by=${actor.id},reviewed_at=${now}
        where tenant_id=${tenantId}::uuid and entra_object_id=${objectId}::uuid
      `;
      await audit(
        tx,
        actor,
        'microsoft_directory.employee_created',
        'employee',
        String(employee.id),
        null,
        safeJson({
          directoryObjectId: objectId,
          departmentId: input.departmentId,
          hireDate: input.hireDate,
        }),
        correlationId,
      );
      return safeJson({
        objectId,
        reviewState: 'employee',
        linkedEmployeeId: String(employee.id),
      });
    },
  );
}
