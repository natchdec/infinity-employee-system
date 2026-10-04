import { requireRole, type Actor } from '../domain/core';
import { db } from './db';

export interface ProjectCostRow {
  projectId: string;
  code: string;
  name: string;
  customer: string | null;
  costCenter: string | null;
  poNumber: string | null;
  lineCount: number;
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

const groupKeySql = `coalesce(nullif(upper(btrim(po_number)),''),'ITEM:' || id::text)`;

/**
 * Project cost reporting deliberately uses accounting-safe source events:
 * - OT comes from non-void payroll items.
 * - Standalone expenses come from non-void verified payable obligations.
 * - Business travel comes from Finance-verified settlement actuals.
 *
 * Source rows sharing the same PO number are one reporting project. Requests can
 * remain linked to their immutable source row while cost reporting rolls every
 * row in that PO group into one project.
 */
export async function financeProjectCosts(actor: Actor, limit = 500): Promise<ProjectCostSummary> {
  requireRole(actor, 'finance', 'admin');
  const rows = await db().unsafe(
    `
      with project_map as (
        select id, ${groupKeySql} as group_key
        from project_references
      ),
      project_group as (
        select
          ${groupKeySql} as group_key,
          (array_agg(id order by source_item_id,id))[1] as id,
          (array_agg(code order by source_item_id,id))[1] as code,
          (array_agg(name order by source_item_id,id))[1] as name,
          (array_agg(customer order by source_item_id,id))[1] as customer,
          (array_agg(cost_center order by source_item_id,id))[1] as cost_center,
          (array_agg(po_number order by source_item_id,id))[1] as po_number,
          count(*)::integer as line_count,
          case when bool_or(status='active') then 'active' else 'inactive' end as status
        from project_references
        group by ${groupKeySql}
      ),
      ot_cost as (
        select
          pm.group_key,
          coalesce(sum(i.amount_satang),0)::text as amount_satang
        from payroll_items i
        join requests r on r.id=i.request_id
        join project_map pm on pm.id=r.project_reference_id
        where i.state <> 'void'
        group by pm.group_key
      ),
      expense_cost as (
        select
          pm.group_key,
          coalesce(sum(o.amount_satang),0)::text as amount_satang
        from payable_obligations o
        join requests r on r.id=o.request_id
        join project_map pm on pm.id=r.project_reference_id
        where r.parent_trip_id is null
          and o.source_kind='expense'
          and o.state <> 'void'
        group by pm.group_key
      ),
      travel_cost as (
        select
          pm.group_key,
          coalesce(sum(s.actual_satang),0)::text as amount_satang
        from settlements s
        join requests r on r.id=s.trip_id
        join project_map pm on pm.id=r.project_reference_id
        where s.state in ('refund_due','top_up_due','settled')
        group by pm.group_key
      ),
      queues as (
        select
          pm.group_key,
          count(*) filter (where r.workflow_state='pending_head')::integer as pending_head,
          count(*) filter (where r.finance_state='pending')::integer as pending_finance,
          max(r.updated_at) as latest_activity_at
        from requests r
        join project_map pm on pm.id=r.project_reference_id
        group by pm.group_key
      )
      select
        p.id,p.code,p.name,p.customer,p.cost_center,p.po_number,p.line_count,p.status,
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
      from project_group p
      left join ot_cost ot on ot.group_key=p.group_key
      left join expense_cost ex on ex.group_key=p.group_key
      left join travel_cost tr on tr.group_key=p.group_key
      left join queues q on q.group_key=p.group_key
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
        coalesce(p.po_number,p.code)
      limit $1
    `,
    [limit],
  );

  const mapped: ProjectCostRow[] = rows.map((row) => ({
    projectId: String(row.id),
    code: String(row.code),
    name: String(row.name),
    customer: row.customer ? String(row.customer) : null,
    costCenter: row.cost_center ? String(row.cost_center) : null,
    poNumber: row.po_number ? String(row.po_number) : null,
    lineCount: Number(row.line_count ?? 1),
    status: String(row.status),
    otSatang: String(row.ot_satang),
    expenseSatang: String(row.expense_satang),
    travelSatang: String(row.travel_satang),
    totalSatang: String(row.total_satang),
    pendingHead: Number(row.pending_head ?? 0),
    pendingFinance: Number(row.pending_finance ?? 0),
    latestActivityAt: row.latest_activity_at ? new Date(row.latest_activity_at as Date) : null,
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
    poNumber: string | null;
    lineCount: number;
    lastSyncedAt: Date;
  };
  cost: ProjectCostRow;
  activities: ProjectCostActivity[];
}

export async function financeProjectCostDetail(
  actor: Actor,
  projectId: string,
): Promise<ProjectCostDetail | null> {
  requireRole(actor, 'finance', 'admin');
  const [target] = await db().unsafe(
    `select ${groupKeySql} as group_key from project_references where id=$1 limit 1`,
    [projectId],
  );
  if (!target) return null;
  const groupKey = String(target.group_key);

  const [project] = await db().unsafe(
    `
      select
        (array_agg(id order by source_item_id,id))[1] as id,
        (array_agg(code order by source_item_id,id))[1] as code,
        (array_agg(name order by source_item_id,id))[1] as name,
        (array_agg(customer order by source_item_id,id))[1] as customer,
        (array_agg(sales_owner order by source_item_id,id))[1] as sales_owner,
        (array_agg(engineer_lead order by source_item_id,id))[1] as engineer_lead,
        min(start_date)::text as start_date,
        max(end_date)::text as end_date,
        case when bool_or(status='active') then 'active' else 'inactive' end as status,
        (array_agg(cost_center order by source_item_id,id))[1] as cost_center,
        (array_agg(po_number order by source_item_id,id))[1] as po_number,
        count(*)::integer as line_count,
        max(last_synced_at) as last_synced_at
      from project_references
      where ${groupKeySql}=$1
      group by ${groupKeySql}
    `,
    [groupKey],
  );
  if (!project) return null;

  const memberSql = `select id from project_references where ${groupKeySql}=$1`;
  const [ot, expense, travel, queue, activities] = await Promise.all([
    db().unsafe(
      `
        select coalesce(sum(i.amount_satang),0)::text as amount_satang
        from payroll_items i
        join requests r on r.id=i.request_id
        where r.project_reference_id in (${memberSql}) and i.state <> 'void'
      `,
      [groupKey],
    ),
    db().unsafe(
      `
        select coalesce(sum(o.amount_satang),0)::text as amount_satang
        from payable_obligations o
        join requests r on r.id=o.request_id
        where r.project_reference_id in (${memberSql})
          and r.parent_trip_id is null
          and o.source_kind='expense'
          and o.state <> 'void'
      `,
      [groupKey],
    ),
    db().unsafe(
      `
        select coalesce(sum(s.actual_satang),0)::text as amount_satang
        from settlements s
        join requests r on r.id=s.trip_id
        where r.project_reference_id in (${memberSql})
          and s.state in ('refund_due','top_up_due','settled')
      `,
      [groupKey],
    ),
    db().unsafe(
      `
        select
          count(*) filter (where workflow_state='pending_head')::integer as pending_head,
          count(*) filter (where finance_state='pending')::integer as pending_finance,
          max(updated_at) as latest_activity_at
        from requests
        where project_reference_id in (${memberSql})
      `,
      [groupKey],
    ),
    db().unsafe(
      `
        select id,reference,kind,title,workflow_state,finance_state,total_satang::text,updated_at
        from requests
        where project_reference_id in (${memberSql})
        order by updated_at desc,id desc
        limit 30
      `,
      [groupKey],
    ),
  ]);

  const otSatang = String(ot[0]?.amount_satang ?? '0');
  const expenseSatang = String(expense[0]?.amount_satang ?? '0');
  const travelSatang = String(travel[0]?.amount_satang ?? '0');
  const totalSatang = (BigInt(otSatang) + BigInt(expenseSatang) + BigInt(travelSatang)).toString();
  const canonicalId = String(project.id);
  const poNumber = project.po_number ? String(project.po_number) : null;
  const lineCount = Number(project.line_count ?? 1);

  return {
    project: {
      id: canonicalId,
      code: String(project.code),
      name: String(project.name),
      customer: project.customer ? String(project.customer) : null,
      salesOwner: project.sales_owner ? String(project.sales_owner) : null,
      engineerLead: project.engineer_lead ? String(project.engineer_lead) : null,
      startDate: project.start_date ? String(project.start_date) : null,
      endDate: project.end_date ? String(project.end_date) : null,
      status: String(project.status),
      costCenter: project.cost_center ? String(project.cost_center) : null,
      poNumber,
      lineCount,
      lastSyncedAt: new Date(project.last_synced_at as Date),
    },
    cost: {
      projectId: canonicalId,
      code: String(project.code),
      name: String(project.name),
      customer: project.customer ? String(project.customer) : null,
      costCenter: project.cost_center ? String(project.cost_center) : null,
      poNumber,
      lineCount,
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
