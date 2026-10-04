import { bangkokDate } from '../domain/calendar';
import { invariant, type Actor, type Json } from '../domain/core';
import type { RequestInput } from '../domain/requests';
import type { Transaction } from './db';

export const approvalRouteKeys = [
  'leave',
  'ot',
  'expense_travel',
  'expense_other',
  'expense_mixed',
  'trip',
  'advance',
] as const;

export type ApprovalRouteKey = (typeof approvalRouteKeys)[number];
export type ApprovalRouteMode = 'line_head' | 'specific_employee';

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
  mode: ApprovalRouteMode;
  configuredApproverId: string | null;
  assignedApproverId: string | null;
  usedLineHeadFallback: boolean;
}

export function approvalRouteKey(input: RequestInput): ApprovalRouteKey {
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
    'ต้องมีหัวหน้าตามสายงานที่เปิดใช้งานเพียงหนึ่งคน',
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

  const [route] = await tx`
    select id,route_key,version,mode,approver_employee_id
    from approval_route_versions
    where route_key=${routeKey}
      and effective_from<=${today}::date
    order by effective_from desc,version desc
    limit 1
  `;
  invariant(route, 'APPROVAL_ROUTE_NOT_CONFIGURED', 'ยังไม่ได้กำหนดเส้นทางผู้อนุมัติ', 409);

  if (actor.isHeadOwner) {
    return {
      routeKey,
      routeVersionId: String(route.id),
      routeVersion: Number(route.version),
      mode: String(route.mode) as ApprovalRouteMode,
      configuredApproverId: route.approver_employee_id ? String(route.approver_employee_id) : null,
      assignedApproverId: null,
      usedLineHeadFallback: false,
    };
  }

  if (route.mode === 'specific_employee') {
    const configuredApproverId = String(route.approver_employee_id);
    if (configuredApproverId !== actor.id) {
      const [approver] = await tx`
        select e.id
        from employees e
        where e.id=${configuredApproverId}
          and e.active
          and exists(
            select 1 from employee_roles er
            where er.employee_id=e.id and er.role='head'
          )
      `;
      invariant(
        approver,
        'APPROVER_NOT_AVAILABLE',
        'ผู้อนุมัติที่กำหนดไว้ไม่พร้อมใช้งานหรือไม่มีสิทธิ์ Head',
        409,
      );
      return {
        routeKey,
        routeVersionId: String(route.id),
        routeVersion: Number(route.version),
        mode: 'specific_employee',
        configuredApproverId,
        assignedApproverId: configuredApproverId,
        usedLineHeadFallback: false,
      };
    }

    const fallback = await activeLineHead(tx, actor.id, today);
    return {
      routeKey,
      routeVersionId: String(route.id),
      routeVersion: Number(route.version),
      mode: 'specific_employee',
      configuredApproverId,
      assignedApproverId: fallback,
      usedLineHeadFallback: true,
    };
  }

  const lineHead = await activeLineHead(tx, actor.id, today);
  return {
    routeKey,
    routeVersionId: String(route.id),
    routeVersion: Number(route.version),
    mode: 'line_head',
    configuredApproverId: null,
    assignedApproverId: lineHead,
    usedLineHeadFallback: false,
  };
}

export function approvalRouteAudit(route: ApprovalRouteResolution): Record<string, Json> {
  return {
    routeKey: route.routeKey,
    routeVersionId: route.routeVersionId,
    routeVersion: route.routeVersion,
    mode: route.mode,
    configuredApproverId: route.configuredApproverId,
    assignedApproverId: route.assignedApproverId,
    usedLineHeadFallback: route.usedLineHeadFallback,
  };
}
