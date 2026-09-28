import { db } from './db';

export interface ProjectCostRow {
  projectId: string;
  code: string;
  name: string;
  customer: string | null;
  costCenter: string | null;
  status: string;
  otSatang: string;
  expenseSatang: string;
  travelSatang: string;
  totalSatang: string;
  pendingHead: number;
  pendingFinance: number;
  latestActivityAt: Date | null;
}

export interface ProjectCostSummary {
  rows: ProjectCostRow[];
  totalOtSatang: string;
  totalExpenseSatang: string;
  totalTravelSatang: string;
  totalSatang: string;
  pendingHead: number;
  pendingFinance: number;
}

/**
 * Project cost reporting deliberately uses accounting-safe source events:
 * - OT comes from non-void payroll items.
 * - Standalone expenses come from non-void verified payable obligations.
 * - Business travel comes from Finance-verified settlement actuals.
 *
 * Advances are cash movements, not cost, and are excluded. Trip-linked expenses
 * are represented through the verified settlement actual to avoid double count.
 */
export async function financeProjectCosts(limit = 500): Promise<ProjectCostSummary> {
  const rows = await db()`
    with ot_cost as (
      select
        r.project_reference_id as project_id,
        coalesce(sum(i.amount_satang),0)::text as amount_satang
      from payroll_items i
      join requests r on r.id=i.request_id
      where r.project_reference_id is not null
        and i.state <> 'void'
      group by r.project_reference_id
    ),
    expense_cost as (
      select
        r.project_reference_id as project_id,
        coalesce(sum(o.amount_satang),0)::text as amount_satang
      from payable_obligations o
      join requests r on r.id=o.request_id
      where r.project_reference_id is not null
        and r.parent_trip_id is null
        and o.source_kind='expense'
        and o.state <> 'void'
      group by r.project_reference_id
    ),
    travel_cost as (
      select
        r.project_reference_id as project_id,
        coalesce(sum(s.actual_satang),0)::text as amount_satang
      from settlements s
      join requests r on r.id=s.trip_id
      where r.project_reference_id is not null
        and s.state in ('refund_due','top_up_due','settled')
      group by r.project_reference_id
    ),
    queues as (
      select
        r.project_reference_id as project_id,
        count(*) filter (where r.workflow_state='pending_head')::integer as pending_head,
        count(*) filter (where r.finance_state='pending')::integer as pending_finance,
        max(r.updated_at) as latest_activity_at
      from requests r
      where r.project_reference_id is not null
      group by r.project_reference_id
    )
    select
      p.id,
      p.code,
      p.name,
      p.customer,
      p.cost_center,
      p.status,
      coalesce(ot.amount_satang,'0') as ot_satang,
      coalesce(ex.amount_satang,'0') as expense_satang,
      coalesce(tr.amount_satang,'0') as travel_satang,
      (
        coalesce(ot.amount_satang,'0')::bigint +
        coalesce(ex.amount_satang,'0')::bigint +
        coalesce(tr.amount_satang,'0')::bigint
      )::text as total_satang,
      coalesce(q.pending_head,0)::integer as pending_head,
      coalesce(q.pending_finance,0)::integer as pending_finance,
      q.latest_activity_at
    from project_references p
    left join ot_cost ot on ot.project_id=p.id
    left join expense_cost ex on ex.project_id=p.id
    left join travel_cost tr on tr.project_id=p.id
    left join queues q on q.project_id=p.id
    where
      coalesce(ot.amount_satang,'0')::bigint > 0
      or coalesce(ex.amount_satang,'0')::bigint > 0
      or coalesce(tr.amount_satang,'0')::bigint > 0
      or coalesce(q.pending_head,0) > 0
      or coalesce(q.pending_finance,0) > 0
    order by
      (
        coalesce(ot.amount_satang,'0')::bigint +
        coalesce(ex.amount_satang,'0')::bigint +
        coalesce(tr.amount_satang,'0')::bigint
      ) desc,
      p.code
    limit ${limit}
  `;

  const mapped: ProjectCostRow[] = rows.map((row) => ({
    projectId: String(row.id),
    code: String(row.code),
    name: String(row.name),
    customer: row.customer ? String(row.customer) : null,
    costCenter: row.cost_center ? String(row.cost_center) : null,
    status: String(row.status),
    otSatang: String(row.ot_satang),
    expenseSatang: String(row.expense_satang),
    travelSatang: String(row.travel_satang),
    totalSatang: String(row.total_satang),
    pendingHead: Number(row.pending_head ?? 0),
    pendingFinance: Number(row.pending_finance ?? 0),
    latestActivityAt: row.latest_activity_at ? new Date(row.latest_activity_at) : null,
  }));

  return {
    rows: mapped,
    totalOtSatang: mapped.reduce((sum, row) => sum + BigInt(row.otSatang), 0n).toString(),
    totalExpenseSatang: mapped.reduce((sum, row) => sum + BigInt(row.expenseSatang), 0n).toString(),
    totalTravelSatang: mapped.reduce((sum, row) => sum + BigInt(row.travelSatang), 0n).toString(),
    totalSatang: mapped.reduce((sum, row) => sum + BigInt(row.totalSatang), 0n).toString(),
    pendingHead: mapped.reduce((sum, row) => sum + row.pendingHead, 0),
    pendingFinance: mapped.reduce((sum, row) => sum + row.pendingFinance, 0),
  };
}
