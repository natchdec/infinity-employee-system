import { bangkokDate } from '../domain/calendar';
import { invariant, type Actor, type Json } from '../domain/core';
import type { RequestInput } from '../domain/requests';
import type { Transaction } from './db';

export const approvalRouteKeys = [
  'leave_annual',
  'leave_sick',
  'leave_other',
  'ot',
  'expense_travel',
  'expense_other',
  'expense_mixed',
  'trip',
  'advance',
] as const;

export type ApprovalRouteKey = (typeof approvalRouteKeys)[number];
export type FinalApprovalMode = 'none' | 'specific_employee' | 'finance_payer';

const travelExpenseCategories = new Set([
  'mileage',
  'taxi',
  'grab',
  'toll',
  'parking',
  'rental_car',
  'fuel',
  'hotel',
]);

export interface ApprovalRouteResolution {
  routeKey: ApprovalRouteKey;
  routeVersionId: string;
  routeVersion: number;
  mode: FinalApprovalMode;
  headId: string | null;
  finalApproverId: string | null;
}

export function approvalRouteKey(input: RequestInput): ApprovalRouteKey {
  if (input.kind === 'leave') {
    if (input.typeId === 'annual') return 'leave_annual';
    if (input.typeId === 'sick') return 'leave_sick';
    return 'leave_other';
  }
  if (input.kind !== 'expense') return input.kind;

  const groups = new Set(
    input.lines.map((line) => (travelExpenseCategories.has(line.categoryId) ? 'travel' : 'other')),
  );
  if (groups.size > 1) return 'expense_mixed';
  return groups.has('travel') ? 'expense_travel' : 'expense_other';
}

async function activeLineHead(tx: Transaction, employeeId: string, today: string): Promise<string> {
  const heads = await tx`
    select rl.head_id
    from reporting_lines rl
    join employees e on e.id=rl.head_id
    where rl.employee_id=${employeeId}
      and rl.effective_from<=${today}::date
      and (rl.effective_to is null or rl.effective_to>${today}::date)
      and e.active
      and exists(
        select 1 from employee_roles er
        where er.employee_id=e.id and er.role='head'
      )
  `;
  invariant(
    heads.length === 1 && heads[0]!.head_id !== employeeId,
    'HEAD_NOT_CONFIGURED',
    'ต้องมีหัวหน้าตาม Reporting Line ที่เปิดใช้งานเพียงหนึ่งคน',
  );
  return String(heads[0]!.head_id);
}

export async function resolveApprovalRoute(
  tx: Transaction,
  actor: Actor,
  input: RequestInput,
  now: Date,
): Promise<ApprovalRouteResolution> {
  const routeKey = approvalRouteKey(input);
  const today = bangkokDate(now);
  const headId = actor.isHeadOwner ? null : await activeLineHead(tx, actor.id, today);

  const [route] = await tx`
    select id,route_key,version,mode,approver_employee_id
    from approval_route_versions
    where route_key=${routeKey}
      and effective_from<=${today}::date
    order by effective_from desc,version desc
    limit 1
  `;
  invariant(route, 'APPROVAL_ROUTE_NOT_CONFIGURED', 'ยังไม่ได้กำหนด Final Approval Route', 409);

  const rawMode = String(route.mode);
  const leaveRoute = routeKey.startsWith('leave_');
  const mode: FinalApprovalMode = leaveRoute
    ? rawMode === 'specific_employee'
      ? 'specific_employee'
      : 'none'
    : rawMode === 'finance_payer'
      ? 'finance_payer'
      : 'none';

  let finalApproverId: string | null = null;
  if (mode !== 'none') {
    finalApproverId = String(route.approver_employee_id ?? '');
    invariant(
      finalApproverId,
      'FINAL_APPROVER_NOT_CONFIGURED',
      'ยังไม่ได้กำหนด Final Approver',
      409,
    );
    invariant(
      finalApproverId !== actor.id,
      'FINAL_APPROVER_SELF_CONFLICT',
      'Final Approver ตรงกับผู้ยื่นคำขอ กรุณากำหนดผู้อนุมัติคนอื่น',
      409,
    );

    const [approver] =
      mode === 'finance_payer'
        ? await tx`
            select e.id
            from employees e
            where e.id=${finalApproverId}
              and e.active
              and exists(
                select 1 from employee_roles er
                where er.employee_id=e.id and er.role='finance_payer'
              )
          `
        : await tx`
            select e.id
            from employees e
            where e.id=${finalApproverId}
              and e.active
          `;
    invariant(
      approver,
      'FINAL_APPROVER_NOT_AVAILABLE',
      mode === 'finance_payer'
        ? 'Final Approver ต้องเป็น Finance Payer ที่เปิดใช้งาน'
        : 'Final Approver ที่กำหนดไว้ไม่พร้อมใช้งาน',
      409,
    );
  }

  return {
    routeKey,
    routeVersionId: String(route.id),
    routeVersion: Number(route.version),
    mode,
    headId,
    finalApproverId,
  };
}

export function approvalRouteAudit(route: ApprovalRouteResolution): Record<string, Json> {
  return {
    routeKey: route.routeKey,
    routeVersionId: route.routeVersionId,
    routeVersion: route.routeVersion,
    mode: route.mode,
    headId: route.headId,
    finalApproverId: route.finalApproverId,
  };
}

export function finalApprovalAfterHead(route: ApprovalRouteResolution): boolean {
  return (
    route.finalApproverId !== null &&
    ['leave_annual', 'leave_sick', 'leave_other', 'ot', 'trip'].includes(route.routeKey)
  );
}

export function finalApprovalAfterFinance(route: ApprovalRouteResolution): boolean {
  return (
    route.finalApproverId !== null &&
    ['expense_travel', 'expense_other', 'expense_mixed', 'advance'].includes(route.routeKey)
  );
}
