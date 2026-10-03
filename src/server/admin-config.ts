import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bangkokDate } from '../domain/calendar';
import {
  fingerprint,
  invariant,
  requireRevision,
  requireRole,
  type Actor,
  type Json,
  type Role,
} from '../domain/core';
import { approvalPolicySchema, dateSchema } from '../domain/policy';
import { audit, command, db, safeJson, type Transaction } from './db';

const roleOrder: Role[] = ['employee', 'head', 'finance', 'finance_payer', 'admin'];
const roleSchema = z.enum(['employee', 'head', 'finance', 'finance_payer', 'admin']);

export const employeeAdminSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    departmentId: z.string().uuid().nullable(),
    roles: z.array(roleSchema).min(1).max(5),
    isHeadOwner: z.boolean(),
    active: z.boolean(),
  })
  .strict();

export const departmentAdminSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      code: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
      name: z.string().trim().min(1).max(120),
    })
    .strict(),
  z
    .object({
      action: z.literal('update'),
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      active: z.boolean(),
    })
    .strict(),
]);

export const reportingLineAdminSchema = z
  .object({
    employeeId: z.string().uuid(),
    headId: z.string().uuid().nullable(),
    effectiveFrom: dateSchema,
  })
  .strict();

export interface AdminEmployeeRow {
  id: string;
  email: string;
  displayName: string;
  active: boolean;
  isHeadOwner: boolean;
  revision: number;
  departmentId: string | null;
  departmentName: string | null;
  roles: Role[];
  headId: string | null;
  headName: string | null;
}

export interface AdminDepartmentRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  activeEmployees: number;
}

export interface ApprovalRuleRow {
  kind: 'leave' | 'ot' | 'expense' | 'trip' | 'advance';
  label: string;
  manager: string;
  finance: string;
  destination: string;
}

export interface ApprovalPolicyView {
  version: number;
  effectiveFrom: string;
  body: z.infer<typeof approvalPolicySchema>;
  hash: string;
}

export function normalizeAdminRoles(input: readonly Role[], isHeadOwner: boolean): Role[] {
  const values = new Set<Role>(input);
  values.add('employee');
  if (isHeadOwner) values.add('head');
  if (values.has('finance_payer')) values.add('finance');
  return roleOrder.filter((role) => values.has(role));
}

export function wouldCreateReportingCycle(
  edges: ReadonlyMap<string, string>,
  employeeId: string,
  headId: string,
): boolean {
  const routed = new Map(edges);
  routed.set(employeeId, headId);
  const visited = new Set<string>();
  let cursor: string | undefined = employeeId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = routed.get(cursor);
  }
  return false;
}

export function approvalRuleRows(): ApprovalRuleRow[] {
  return [
    {
      kind: 'leave',
      label: 'ลา',
      manager: 'Line Head',
      finance: 'ไม่ใช้',
      destination: 'Approved',
    },
    {
      kind: 'ot',
      label: 'OT',
      manager: 'Line Head',
      finance: 'ไม่ใช้',
      destination: 'Payroll Queue',
    },
    {
      kind: 'expense',
      label: 'ค่าใช้จ่าย',
      manager: 'Line Head',
      finance: 'Finance Verify → Finance Payer',
      destination: 'Separate Payment / Payment Batch',
    },
    {
      kind: 'trip',
      label: 'เดินทาง',
      manager: 'Line Head',
      finance: 'ไม่ใช้',
      destination: 'Approved Trip',
    },
    {
      kind: 'advance',
      label: 'เงินทดรอง',
      manager: 'Line Head',
      finance: 'Finance Verify → Finance Payer',
      destination: 'Separate Payment / Payment Batch',
    },
  ];
}

export async function adminDepartments(): Promise<AdminDepartmentRow[]> {
  const rows = await db()`
    select d.id,d.code,d.name,d.active,
      count(e.id) filter (where e.active)::integer as active_employees
    from departments d
    left join employees e on e.department_id=d.id
    group by d.id
    order by d.active desc,d.name,d.code
  `;
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    activeEmployees: row.active_employees ?? 0,
  }));
}

export async function adminEmployees(now = new Date()): Promise<AdminEmployeeRow[]> {
  const today = bangkokDate(now);
  const rows = await db()`
    select
      e.id,e.email,e.display_name,e.active,e.is_head_owner,e.revision,
      d.id as department_id,d.name as department_name,
      coalesce(array_agg(er.role order by er.role) filter(where er.role is not null),array[]::text[]) as roles,
      current_line.head_id,current_line.head_name
    from employees e
    left join departments d on d.id=e.department_id
    left join employee_roles er on er.employee_id=e.id
    left join lateral (
      select rl.head_id,h.display_name as head_name
      from reporting_lines rl
      join employees h on h.id=rl.head_id
      where rl.employee_id=e.id
        and rl.effective_from<=${today}::date
        and (rl.effective_to is null or rl.effective_to>${today}::date)
      order by rl.effective_from desc
      limit 1
    ) current_line on true
    group by e.id,d.id,current_line.head_id,current_line.head_name
    order by e.active desc,e.display_name,e.email
  `;
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    active: row.active,
    isHeadOwner: row.is_head_owner,
    revision: row.revision,
    departmentId: row.department_id ?? null,
    departmentName: row.department_name ?? null,
    roles: (row.roles as string[]).filter((role): role is Role => roleOrder.includes(role as Role)),
    headId: row.head_id ?? null,
    headName: row.head_name ?? null,
  }));
}

async function assertHeadCanBeRemoved(
  tx: Transaction,
  employeeId: string,
  nextRoles: Role[],
  nextActive: boolean,
  today: string,
): Promise<void> {
  if (nextActive && nextRoles.includes('head')) return;
  const activeLines = await tx`
    select 1 from reporting_lines
    where head_id=${employeeId}
      and (effective_to is null or effective_to>${today}::date)
    limit 1
  `;
  invariant(
    !activeLines.length,
    'HEAD_STILL_ASSIGNED',
    'หัวหน้าคนนี้ยังมี Reporting Line ที่มีผลอยู่ กรุณาย้ายลูกทีมก่อน',
    409,
  );
}

export async function updateAdminEmployee(
  actor: Actor,
  employeeId: string,
  raw: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
): Promise<Json> {
  requireRole(actor, 'admin');
  const input = employeeAdminSchema.parse(raw);
  const nextRoles = normalizeAdminRoles(input.roles, input.isHeadOwner);
  const today = bangkokDate(now);

  invariant(
    actor.id !== employeeId || input.active,
    'ADMIN_SELF_DEACTIVATE_FORBIDDEN',
    'ไม่สามารถปิดบัญชีผู้ดูแลที่กำลังใช้งานอยู่ได้',
    409,
  );
  invariant(
    actor.id !== employeeId || nextRoles.includes('admin'),
    'ADMIN_SELF_ROLE_FORBIDDEN',
    'ไม่สามารถถอดสิทธิ์ Admin ของบัญชีที่กำลังใช้งานอยู่ได้',
    409,
  );

  return command(
    actor,
    `admin.employee:${employeeId}`,
    idempotencyKey,
    { employeeId, ...input, roles: nextRoles },
    async (tx) => {
      const [current] = await tx`
      select id,department_id,active,is_head_owner,revision
      from employees where id=${employeeId} for update
    `;
      invariant(current, 'EMPLOYEE_NOT_FOUND', 'ไม่พบพนักงาน', 404);
      requireRevision(current.revision, input.expectedRevision);

      if (input.departmentId) {
        const [department] =
          await tx`select id from departments where id=${input.departmentId} and active for update`;
        invariant(department, 'DEPARTMENT_NOT_AVAILABLE', 'แผนกนี้ไม่เปิดใช้งานแล้ว', 409);
      }

      await assertHeadCanBeRemoved(tx, employeeId, nextRoles, input.active, today);
      const oldRolesRows =
        await tx`select role from employee_roles where employee_id=${employeeId} order by role`;
      const oldRoles = oldRolesRows.map((row) => String(row.role));

      const [updated] = await tx`
      update employees
      set department_id=${input.departmentId},active=${input.active},is_head_owner=${input.isHeadOwner},revision=revision+1
      where id=${employeeId}
      returning revision
    `;
      await tx`delete from employee_roles where employee_id=${employeeId}`;
      for (const role of nextRoles) {
        await tx`insert into employee_roles(employee_id,role) values(${employeeId},${role})`;
      }

      await audit(
        tx,
        actor,
        'admin.employee_updated',
        'employee',
        employeeId,
        updated!.revision,
        safeJson({
          oldDepartmentId: current.department_id,
          newDepartmentId: input.departmentId,
          oldActive: current.active,
          newActive: input.active,
          oldHeadOwner: current.is_head_owner,
          newHeadOwner: input.isHeadOwner,
          oldRoles,
          newRoles: nextRoles,
        }),
        correlationId,
      );

      return safeJson({
        id: employeeId,
        revision: updated!.revision,
        roles: nextRoles,
        active: input.active,
        isHeadOwner: input.isHeadOwner,
        departmentId: input.departmentId,
      });
    },
  );
}

export async function mutateAdminDepartment(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  correlationId: string = randomUUID(),
): Promise<Json> {
  requireRole(actor, 'admin');
  const input = departmentAdminSchema.parse(raw);
  return command(actor, 'admin.department', idempotencyKey, input, async (tx) => {
    if (input.action === 'create') {
      const [row] = await tx`
        insert into departments(code,name,active)
        values(${input.code},${input.name},true)
        on conflict(code) do nothing
        returning id,code,name,active
      `;
      invariant(row, 'DEPARTMENT_CODE_EXISTS', 'รหัสแผนกนี้มีอยู่แล้ว', 409);
      await audit(
        tx,
        actor,
        'admin.department_created',
        'department',
        row.id,
        null,
        safeJson({ code: row.code, name: row.name }),
        correlationId,
      );
      return safeJson(row);
    }

    const [current] =
      await tx`select id,code,name,active from departments where id=${input.id} for update`;
    invariant(current, 'DEPARTMENT_NOT_FOUND', 'ไม่พบแผนก', 404);
    if (!input.active) {
      const employees =
        await tx`select 1 from employees where department_id=${input.id} and active limit 1`;
      invariant(
        !employees.length,
        'DEPARTMENT_IN_USE',
        'ย้ายพนักงานที่ยังใช้งานอยู่ออกจากแผนกนี้ก่อนปิดแผนก',
        409,
      );
    }
    await tx`update departments set name=${input.name},active=${input.active} where id=${input.id}`;
    await audit(
      tx,
      actor,
      'admin.department_updated',
      'department',
      input.id,
      null,
      safeJson({
        code: current.code,
        oldName: current.name,
        newName: input.name,
        oldActive: current.active,
        newActive: input.active,
      }),
      correlationId,
    );
    return safeJson({ id: input.id, code: current.code, name: input.name, active: input.active });
  });
}

export async function setAdminReportingLine(
  actor: Actor,
  raw: unknown,
  idempotencyKey: string,
  now = new Date(),
  correlationId: string = randomUUID(),
): Promise<Json> {
  requireRole(actor, 'admin');
  const input = reportingLineAdminSchema.parse(raw);
  const today = bangkokDate(now);
  invariant(
    input.effectiveFrom >= today,
    'REPORTING_LINE_BACKDATE_FORBIDDEN',
    'การเปลี่ยน Reporting Line จากหน้า Admin ต้องมีผลตั้งแต่วันนี้หรืออนาคต',
    409,
  );
  invariant(
    !input.headId || input.headId !== input.employeeId,
    'REPORTING_LINE_SELF',
    'พนักงานไม่สามารถเป็นหัวหน้าของตัวเอง',
    409,
  );

  return command(
    actor,
    `admin.reporting_line:${input.employeeId}`,
    idempotencyKey,
    input,
    async (tx) => {
      const [employee] = await tx`
      select id,display_name,active,is_head_owner from employees where id=${input.employeeId} for update
    `;
      invariant(employee?.active, 'EMPLOYEE_NOT_ACTIVE', 'พนักงานไม่เปิดใช้งาน', 409);
      invariant(
        !input.headId || !employee.is_head_owner,
        'OWNER_HEAD_LINE_NOT_REQUIRED',
        'Owner / Head จะข้ามขั้น Manager approval จึงไม่ต้องกำหนด Reporting Line',
        409,
      );

      if (input.headId) {
        const [head] = await tx`
        select e.id from employees e
        where e.id=${input.headId} and e.active
          and exists(select 1 from employee_roles er where er.employee_id=e.id and er.role='head')
        for update
      `;
        invariant(head, 'HEAD_NOT_AVAILABLE', 'ผู้ที่เลือกต้องเป็น Head ที่เปิดใช้งาน', 409);
      }

      const exact = await tx`
      select id from reporting_lines
      where employee_id=${input.employeeId} and effective_from=${input.effectiveFrom}::date
      limit 1 for update
    `;
      invariant(
        !exact.length,
        'REPORTING_LINE_BOUNDARY_EXISTS',
        'มี Reporting Line ที่วันเริ่มมีผลนี้แล้ว กรุณาเลือกวันใหม่',
        409,
      );

      const activeEdgesRows = await tx`
      select employee_id::text,head_id::text from reporting_lines
      where effective_from<=${input.effectiveFrom}::date
        and (effective_to is null or effective_to>${input.effectiveFrom}::date)
        and employee_id<>${input.employeeId}
    `;
      const edges = new Map<string, string>(
        activeEdgesRows.map((row) => [String(row.employee_id), String(row.head_id)]),
      );
      if (input.headId) {
        invariant(
          !wouldCreateReportingCycle(edges, input.employeeId, input.headId),
          'REPORTING_LINE_CYCLE',
          'โครงสร้างหัวหน้านี้ทำให้เกิดวงวนในสายการรายงาน',
          409,
        );
      }

      const [previous] = await tx`
      select id,effective_from::text,effective_to::text,head_id
      from reporting_lines
      where employee_id=${input.employeeId}
        and effective_from<${input.effectiveFrom}::date
        and (effective_to is null or effective_to>${input.effectiveFrom}::date)
      order by effective_from desc
      limit 1 for update
    `;
      const [next] = await tx`
      select effective_from::text
      from reporting_lines
      where employee_id=${input.employeeId} and effective_from>${input.effectiveFrom}::date
      order by effective_from
      limit 1 for update
    `;

      if (previous) {
        await tx`update reporting_lines set effective_to=${input.effectiveFrom}::date where id=${previous.id}`;
      }
      if (input.headId) {
        await tx`
        insert into reporting_lines(employee_id,head_id,effective_from,effective_to)
        values(${input.employeeId},${input.headId},${input.effectiveFrom}::date,${next?.effective_from ?? null}::date)
      `;
      }

      await audit(
        tx,
        actor,
        input.headId ? 'admin.reporting_line_set' : 'admin.reporting_line_cleared',
        'employee',
        input.employeeId,
        null,
        safeJson({
          previousHeadId: previous?.head_id ?? null,
          headId: input.headId,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: next?.effective_from ?? null,
        }),
        correlationId,
      );

      return safeJson({
        employeeId: input.employeeId,
        headId: input.headId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: next?.effective_from ?? null,
      });
    },
  );
}

export async function adminApprovalPolicy(now = new Date()): Promise<{
  current: ApprovalPolicyView;
  history: ApprovalPolicyView[];
  rows: ApprovalRuleRow[];
}> {
  const today = bangkokDate(now);
  const rows = await db()`
    select version,effective_from::text,body,body_hash
    from policy_versions
    where family='approval' and status='published'
    order by effective_from desc,version desc
  `;
  const history = rows.map((row) => {
    const body = approvalPolicySchema.parse(row.body);
    invariant(
      fingerprint(body) === row.body_hash,
      'POLICY_INTEGRITY',
      'ข้อมูลนโยบาย Approval ไม่ตรงกับหลักฐานที่บันทึกไว้',
      500,
    );
    return { version: row.version, effectiveFrom: row.effective_from, body, hash: row.body_hash };
  });
  const current = history.find((item) => item.effectiveFrom <= today);
  invariant(current, 'POLICY_NOT_CONFIGURED', 'ยังไม่มี Approval Policy ที่มีผล', 409);
  return { current, history, rows: approvalRuleRows() };
}
