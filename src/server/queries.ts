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

export interface PayableQueueRow {
  id: string;
  ownerId: string;
  employeeName: string;
  sourceKind: string;
  requestId: string | null;
  reference: string;
  amountSatang: string;
  state: string;
}

export interface PaymentBatchRow {
  id: string;
  reference: string;
  method: string;
  status: string;
  totalSatang: string;
  revision: number;
  itemCount: number;
  createdAt: Date;
  paidDate: string | null;
  externalReference: string | null;
}

export async function financePayments(): Promise<{
  obligations: PayableQueueRow[];
  batches: PaymentBatchRow[];
}> {
  const obligations = await db()`
    select
      o.id,
      o.owner_id,
      e.display_name,
      o.source_kind,
      o.request_id,
      coalesce(r.reference,'SET-' || left(o.source_id::text,8)) as reference,
      o.amount_satang::text,
      o.state
    from payable_obligations o
    join employees e on e.id=o.owner_id
    left join requests r on r.id=o.request_id
    where o.state='unpaid'
    order by e.display_name,o.id
    limit 300
  `;
  const batches = await db()`
    select
      b.id,b.reference,b.method,b.status,b.total_satang::text,b.revision,b.created_at,
      b.paid_date::text,b.external_reference,
      count(i.obligation_id) filter(where i.active)::integer as item_count
    from payment_batches b
    left join payment_items i on i.batch_id=b.id
    group by b.id
    order by b.created_at desc
    limit 100
  `;
  return {
    obligations: obligations.map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      employeeName: row.display_name,
      sourceKind: row.source_kind,
      requestId: row.request_id ?? null,
      reference: row.reference,
      amountSatang: row.amount_satang,
      state: row.state,
    })),
    batches: batches.map((row) => ({
      id: row.id,
      reference: row.reference,
      method: row.method,
      status: row.status,
      totalSatang: row.total_satang,
      revision: row.revision,
      itemCount: row.item_count ?? 0,
      createdAt: new Date(row.created_at),
      paidDate: row.paid_date ?? null,
      externalReference: row.external_reference ?? null,
    })),
  };
}

export interface SettlementQueueRow {
  id: string;
  tripId: string;
  tripReference: string;
  tripTitle: string;
  ownerId: string;
  employeeName: string;
  revision: number;
  state: string;
  actualSatang: string;
  paidAdvanceSatang: string;
  netSatang: string;
  dueDate: string;
  createdAt: Date;
}

export async function financeSettlements(): Promise<SettlementQueueRow[]> {
  const rows = await db()`
    select
      s.id,s.trip_id,r.reference,r.title,s.owner_id,e.display_name,s.revision,s.state,
      s.actual_satang::text,s.paid_advance_satang::text,s.net_satang::text,
      s.due_date::text,s.created_at
    from settlements s
    join requests r on r.id=s.trip_id
    join employees e on e.id=s.owner_id
    where s.state not in ('void')
    order by
      case when s.state='refund_due' then 0 when s.state='top_up_due' then 1 when s.state='submitted' then 2 else 3 end,
      s.due_date,s.created_at
    limit 200
  `;
  return rows.map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    tripReference: row.reference,
    tripTitle: row.title,
    ownerId: row.owner_id,
    employeeName: row.display_name,
    revision: row.revision,
    state: row.state,
    actualSatang: row.actual_satang,
    paidAdvanceSatang: row.paid_advance_satang,
    netSatang: row.net_satang,
    dueDate: row.due_date,
    createdAt: new Date(row.created_at),
  }));
}

export interface OriginalReceiptQueueRow {
  requestId: string;
  reference: string;
  employeeName: string;
  title: string;
  amountSatang: string;
  paymentState: string;
  state: string;
  revision: number;
  updatedAt: Date;
}

export async function financeOriginalReceipts(): Promise<OriginalReceiptQueueRow[]> {
  const rows = await db()`
    select
      o.request_id,r.reference,e.display_name,r.title,r.total_satang::text,r.payment_state,
      o.state,o.revision,r.updated_at
    from original_receipts o
    join requests r on r.id=o.request_id
    join employees e on e.id=r.employee_id
    where o.state='outstanding'
    order by (r.payment_state='paid') desc,r.updated_at
    limit 300
  `;
  return rows.map((row) => ({
    requestId: row.request_id,
    reference: row.reference,
    employeeName: row.display_name,
    title: row.title,
    amountSatang: row.total_satang,
    paymentState: row.payment_state,
    state: row.state,
    revision: row.revision,
    updatedAt: new Date(row.updated_at),
  }));
}

export interface PayrollCycleRow {
  month: string;
  payday: string;
  cutoffAt: Date;
  state: string;
  revision: number;
  itemCount: number;
  totalSatang: string;
}

export async function financePayroll(): Promise<PayrollCycleRow[]> {
  const rows = await db()`
    select
      c.month,c.payday::text,c.cutoff_at,c.state,c.revision,
      count(i.id) filter(where i.state='queued')::integer as item_count,
      coalesce(sum(i.amount_satang) filter(where i.state='queued'),0)::text as total_satang
    from payroll_cycles c
    left join payroll_items i on i.cycle_month=c.month
    group by c.month
    order by c.month desc
    limit 24
  `;
  return rows.map((row) => ({
    month: row.month,
    payday: row.payday,
    cutoffAt: new Date(row.cutoff_at),
    state: row.state,
    revision: row.revision,
    itemCount: row.item_count ?? 0,
    totalSatang: row.total_satang,
  }));
}

export interface ExportJobRow {
  id: string;
  adapter: string;
  scope: string;
  state: string;
  artifactSha256: string | null;
  blockedReason: string | null;
  createdAt: Date;
}

export async function financeExports(): Promise<ExportJobRow[]> {
  const rows = await db()`
    select id,adapter,scope,state,artifact_sha256,blocked_reason,created_at
    from export_jobs
    order by created_at desc
    limit 100
  `;
  return rows.map((row) => ({
    id: row.id,
    adapter: row.adapter,
    scope: row.scope,
    state: row.state,
    artifactSha256: row.artifact_sha256 ?? null,
    blockedReason: row.blocked_reason ?? null,
    createdAt: new Date(row.created_at),
  }));
}
