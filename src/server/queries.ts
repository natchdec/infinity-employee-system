import { db } from './db';

export interface RequestListRow {
  id: string;
  reference: string;
  kind: 'leave' | 'ot' | 'expense' | 'trip' | 'advance';
  title: string;
  businessDate: string;
  workflowState: string;
  financeState: string;
  paymentState: string;
  totalSatang: string;
  updatedAt: Date;
}

function requestRow(row: Record<string, unknown>): RequestListRow {
  return {
    id: String(row.id),
    reference: String(row.reference),
    kind: row.kind as RequestListRow['kind'],
    title: String(row.title),
    businessDate: String(row.business_date),
    workflowState: String(row.workflow_state),
    financeState: String(row.finance_state),
    paymentState: String(row.payment_state),
    totalSatang: String(row.total_satang),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export async function employeeRequests(employeeId: string, limit = 30): Promise<RequestListRow[]> {
  const rows = await db()`
    select
      id,
      reference,
      kind,
      title,
      business_date::text,
      workflow_state,
      finance_state,
      payment_state,
      total_satang::text,
      updated_at
    from requests
    where employee_id = ${employeeId}
    order by updated_at desc, id desc
    limit ${limit}
  `;
  return rows.map((row) => requestRow(row as Record<string, unknown>));
}

export async function assignedApprovals(headId: string): Promise<
  (RequestListRow & {
    employeeName: string;
  })[]
> {
  const rows = await db()`
    select
      r.id,
      r.reference,
      r.kind,
      r.title,
      r.business_date::text,
      r.workflow_state,
      r.finance_state,
      r.payment_state,
      r.total_satang::text,
      r.updated_at,
      e.display_name
    from requests r
    join employees e on e.id = r.employee_id
    where r.assigned_head_id = ${headId}
      and r.workflow_state = 'pending_head'
    order by r.created_at, r.id
    limit 100
  `;
  return rows.map((row) => ({
    ...requestRow(row as Record<string, unknown>),
    employeeName: String(row.display_name),
  }));
}

export async function employeeTrips(employeeId: string): Promise<RequestListRow[]> {
  const rows = await db()`
    select
      id,
      reference,
      kind,
      title,
      business_date::text,
      workflow_state,
      finance_state,
      payment_state,
      total_satang::text,
      updated_at
    from requests
    where employee_id = ${employeeId}
      and kind = 'trip'
    order by business_date desc, updated_at desc
    limit 100
  `;
  return rows.map((row) => requestRow(row as Record<string, unknown>));
}

export interface FinanceRow extends RequestListRow {
  employeeId: string;
  employeeName: string;
  originalState: string | null;
}

export async function financeOverview(): Promise<{
  pendingVerification: number;
  readyToPay: number;
  originalsOutstanding: number;
  advancesOpen: number;
  rows: FinanceRow[];
}> {
  const [counts] = await db()`
    select
      count(*) filter (where finance_state = 'pending')::integer as pending_verification,
      count(*) filter (where finance_state = 'verified' and payment_state = 'unpaid')::integer as ready_to_pay,
      count(*) filter (where o.state = 'outstanding')::integer as originals_outstanding,
      count(*) filter (where kind = 'advance' and payment_state <> 'paid')::integer as advances_open
    from requests r
    left join original_receipts o on o.request_id = r.id
    where r.kind in ('expense', 'advance')
  `;
  const rows = await db()`
    select
      r.id,
      r.reference,
      r.kind,
      r.employee_id,
      e.display_name,
      r.title,
      r.business_date::text,
      r.workflow_state,
      r.finance_state,
      r.payment_state,
      r.total_satang::text,
      r.updated_at,
      o.state as original_state
    from requests r
    join employees e on e.id = r.employee_id
    left join original_receipts o on o.request_id = r.id
    where r.kind in ('expense', 'advance')
      and (
        r.finance_state in ('pending', 'verified', 'returned')
        or r.payment_state in ('unpaid', 'allocated')
        or o.state = 'outstanding'
      )
    order by r.updated_at desc, r.id desc
    limit 100
  `;
  return {
    pendingVerification: counts?.pending_verification ?? 0,
    readyToPay: counts?.ready_to_pay ?? 0,
    originalsOutstanding: counts?.originals_outstanding ?? 0,
    advancesOpen: counts?.advances_open ?? 0,
    rows: rows.map((row) => ({
      ...requestRow(row as Record<string, unknown>),
      employeeId: String(row.employee_id),
      employeeName: String(row.display_name),
      originalState: row.original_state ? String(row.original_state) : null,
    })),
  };
}

export async function organizationSummary(): Promise<{
  employees: number;
  heads: number;
  finance: number;
  departments: number;
  publishedPolicies: number;
}> {
  const [row] = await db()`
    select
      (select count(*)::integer from employees where active) as employees,
      (select count(distinct employee_id)::integer from employee_roles where role = 'head') as heads,
      (select count(distinct employee_id)::integer from employee_roles where role = 'finance') as finance,
      (select count(*)::integer from departments where active) as departments,
      (select count(*)::integer from policy_versions where status = 'published') as published_policies
  `;
  return {
    employees: row?.employees ?? 0,
    heads: row?.heads ?? 0,
    finance: row?.finance ?? 0,
    departments: row?.departments ?? 0,
    publishedPolicies: row?.published_policies ?? 0,
  };
}
