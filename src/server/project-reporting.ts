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

export interface ProjectCostActivity {
  id: string;
  reference: string;
  kind: string;
  title: string;
  workflowState: string;
  financeState: string;
  totalSatang: string;
  updatedAt: Date;
}

export interface ProjectCostDetail {
  project: {
    id: string;
    code: string;
    name: string;
    customer: string | null;
    salesOwner: string | null;
    engineerLead: string | null;
    startDate: string | null;
    endDate: string | null;
    status: string;
    costCenter: string | null;
    lastSyncedAt: Date;
  };
  cost: ProjectCostRow;
  activities: ProjectCostActivity[];
}

export async function financeProjectCostDetail(
  projectId: string,
): Promise<ProjectCostDetail | null> {
  const [project] = await db()`
    select id,code,name,customer,sales_owner,engineer_lead,start_date::text,end_date::text,
      status,cost_center,last_synced_at
    from project_references
    where id=${projectId}
    limit 1
  `;
  if (!project) return null;

  const [ot, expense, travel, queue, activities] = await Promise.all([
    db()`
      select coalesce(sum(i.amount_satang),0)::text as amount_satang
      from payroll_items i
      join requests r on r.id=i.request_id
      where r.project_reference_id=${projectId} and i.state <> 'void'
    `,
    db()`
      select coalesce(sum(o.amount_satang),0)::text as amount_satang
      from payable_obligations o
      join requests r on r.id=o.request_id
      where r.project_reference_id=${projectId}
        and r.parent_trip_id is null
        and o.source_kind='expense'
        and o.state <> 'void'
    `,
    db()`
      select coalesce(sum(s.actual_satang),0)::text as amount_satang
      from settlements s
      join requests r on r.id=s.trip_id
      where r.project_reference_id=${projectId}
        and s.state in ('refund_due','top_up_due','settled')
    `,
    db()`
      select
        count(*) filter (where workflow_state='pending_head')::integer as pending_head,
        count(*) filter (where finance_state='pending')::integer as pending_finance,
        max(updated_at) as latest_activity_at
      from requests
      where project_reference_id=${projectId}
    `,
    db()`
      select id,reference,kind,title,workflow_state,finance_state,total_satang::text,updated_at
      from requests
      where project_reference_id=${projectId}
      order by updated_at desc,id desc
      limit 30
    `,
  ]);

  const otSatang = String(ot[0]?.amount_satang ?? '0');
  const expenseSatang = String(expense[0]?.amount_satang ?? '0');
  const travelSatang = String(travel[0]?.amount_satang ?? '0');
  const totalSatang = (BigInt(otSatang) + BigInt(expenseSatang) + BigInt(travelSatang)).toString();

  return {
    project: {
      id: String(project.id),
      code: String(project.code),
      name: String(project.name),
      customer: project.customer ? String(project.customer) : null,
      salesOwner: project.sales_owner ? String(project.sales_owner) : null,
      engineerLead: project.engineer_lead ? String(project.engineer_lead) : null,
      startDate: project.start_date ? String(project.start_date) : null,
      endDate: project.end_date ? String(project.end_date) : null,
      status: String(project.status),
      costCenter: project.cost_center ? String(project.cost_center) : null,
      lastSyncedAt: new Date(project.last_synced_at as Date),
    },
    cost: {
      projectId: String(project.id),
      code: String(project.code),
      name: String(project.name),
      customer: project.customer ? String(project.customer) : null,
      costCenter: project.cost_center ? String(project.cost_center) : null,
      status: String(project.status),
      otSatang,
      expenseSatang,
      travelSatang,
      totalSatang,
      pendingHead: Number(queue[0]?.pending_head ?? 0),
      pendingFinance: Number(queue[0]?.pending_finance ?? 0),
      latestActivityAt: queue[0]?.latest_activity_at
        ? new Date(queue[0].latest_activity_at as Date)
        : null,
    },
    activities: activities.map((row) => ({
      id: String(row.id),
      reference: String(row.reference),
      kind: String(row.kind),
      title: String(row.title),
      workflowState: String(row.workflow_state),
      financeState: String(row.finance_state),
      totalSatang: String(row.total_satang ?? '0'),
      updatedAt: new Date(row.updated_at as Date),
    })),
  };
}
