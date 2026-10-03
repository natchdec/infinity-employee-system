import type { Role } from '../domain/core';
import { enqueue, type Transaction } from './db';

export interface EmployeeNotice {
  employeeId: string;
  title: string;
  detail?: string;
  href: string;
}

export async function enqueueEmployeeNotice(
  tx: Transaction,
  eventKey: string,
  notice: EmployeeNotice,
): Promise<void> {
  await enqueue(tx, 'in_app_notification', `${eventKey}:in_app`, {
    employeeId: notice.employeeId,
    title: notice.title,
    href: notice.href,
  });
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== 'true') return;
  await enqueue(tx, 'email_notification', `${eventKey}:email`, {
    employeeId: notice.employeeId,
    title: notice.title,
    detail: notice.detail ?? notice.title,
    href: notice.href,
  });
}

export async function enqueueRoleNotices(
  tx: Transaction,
  role: Role,
  eventKey: string,
  notice: Omit<EmployeeNotice, 'employeeId'>,
  excludeEmployeeIds: readonly string[] = [],
): Promise<number> {
  const rows = await tx`
    select distinct e.id
    from employees e
    join employee_roles er on er.employee_id=e.id
    where e.active
      and er.role=${role}
      and not (e.id = any(${tx.array([...excludeEmployeeIds])}::uuid[]))
    order by e.id
  `;
  for (const row of rows) {
    await enqueueEmployeeNotice(tx, `${eventKey}:${row.id}`, {
      employeeId: String(row.id),
      ...notice,
    });
  }
  return rows.length;
}
