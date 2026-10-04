import { requireRole, type Actor } from '../domain/core';
import { db } from './db';
import {
  financeProjectCostDetail,
  financeProjectCosts,
  type ProjectCostActivity,
  type ProjectCostRow,
} from './project-reporting';

export interface ProjectProfitRow extends ProjectCostRow {
  revenueSatang: string;
  saleCostSatang: string;
  engineerCostSatang: string;
  entertainCostSatang: string;
  hiddenCostSatang: string;
  saleCommissionSatang: string;
  plannedCostSatang: string;
  marginSatang: string;
  marginBasisPoints: number | null;
  plannedRemainingSatang: string;
}

export interface ProjectProfitSummary {
  rows: ProjectProfitRow[];
  totalRevenueSatang: string;
  totalPlannedCostSatang: string;
  totalMarginSatang: string;
  totalOtSatang: string;
  totalExpenseSatang: string;
  totalTravelSatang: string;
  totalSatang: string;
  pendingHead: number;
  pendingFinance: number;
}

export interface ProjectProfitDetail {
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
  cost: ProjectProfitRow;
  activities: ProjectCostActivity[];
}

const groupKeySql = `coalesce(nullif(upper(btrim(po_number)),''),'ITEM:' || id::text)`;

interface FinancialGroup {
  id: string;
  code: string;
  name: string;
  customer: string | null;
  costCenter: string | null;
  poNumber: string | null;
  lineCount: number;
  status: string;
  revenueSatang: string;
  saleCostSatang: string;
  engineerCostSatang: string;
  entertainCostSatang: string;
  hiddenCostSatang: string;
  saleCommissionSatang: string;
}

function plannedCost(row: FinancialGroup): bigint {
  return (
    BigInt(row.saleCostSatang) +
    BigInt(row.engineerCostSatang) +
    BigInt(row.entertainCostSatang) +
    BigInt(row.hiddenCostSatang) +
    BigInt(row.saleCommissionSatang)
  );
}

function mergeProfit(financial: FinancialGroup, actual?: ProjectCostRow): ProjectProfitRow {
  const actualTotal = BigInt(actual?.totalSatang ?? '0');
  const revenue = BigInt(financial.revenueSatang);
  const planned = plannedCost(financial);
  const margin = revenue - actualTotal;
  return {
    projectId: financial.id,
    code: financial.code,
    name: financial.name,
    customer: financial.customer,
    costCenter: financial.costCenter,
    poNumber: financial.poNumber,
    lineCount: financial.lineCount,
    status: financial.status,
    revenueSatang: revenue.toString(),
    saleCostSatang: financial.saleCostSatang,
    engineerCostSatang: financial.engineerCostSatang,
    entertainCostSatang: financial.entertainCostSatang,
    hiddenCostSatang: financial.hiddenCostSatang,
    saleCommissionSatang: financial.saleCommissionSatang,
    plannedCostSatang: planned.toString(),
    otSatang: actual?.otSatang ?? '0',
    expenseSatang: actual?.expenseSatang ?? '0',
    travelSatang: actual?.travelSatang ?? '0',
    totalSatang: actualTotal.toString(),
    marginSatang: margin.toString(),
    marginBasisPoints: revenue > 0n ? Number((margin * 10_000n) / revenue) : null,
    plannedRemainingSatang: (planned - actualTotal).toString(),
    pendingHead: actual?.pendingHead ?? 0,
    pendingFinance: actual?.pendingFinance ?? 0,
    latestActivityAt: actual?.latestActivityAt ?? null,
  };
}

async function financialGroups(limit = 500): Promise<FinancialGroup[]> {
  const rows = await db().unsafe(
    `
      select
        (array_agg(id order by source_item_id,id))[1] as id,
        (array_agg(code order by source_item_id,id))[1] as code,
        (array_agg(name order by source_item_id,id))[1] as name,
        (array_agg(customer order by source_item_id,id))[1] as customer,
        (array_agg(cost_center order by source_item_id,id))[1] as cost_center,
        (array_agg(po_number order by source_item_id,id))[1] as po_number,
        count(*)::integer as line_count,
        case when bool_or(status='active') then 'active' else 'inactive' end as status,
        coalesce(sum(revenue_satang),0)::text as revenue_satang,
        coalesce(sum(sale_cost_satang),0)::text as sale_cost_satang,
        coalesce(sum(engineer_cost_satang),0)::text as engineer_cost_satang,
        coalesce(sum(entertain_cost_satang),0)::text as entertain_cost_satang,
        coalesce(sum(hidden_cost_satang),0)::text as hidden_cost_satang,
        coalesce(sum(sale_commission_satang),0)::text as sale_commission_satang
      from project_references
      where source='microsoft_lists'
      group by ${groupKeySql}
      order by coalesce(sum(revenue_satang),0) desc,
        coalesce((array_agg(po_number order by source_item_id,id))[1],
          (array_agg(code order by source_item_id,id))[1])
      limit $1
    `,
    [limit],
  );

  return rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    customer: row.customer ? String(row.customer) : null,
    costCenter: row.cost_center ? String(row.cost_center) : null,
    poNumber: row.po_number ? String(row.po_number) : null,
    lineCount: Number(row.line_count ?? 1),
    status: String(row.status),
    revenueSatang: String(row.revenue_satang ?? '0'),
    saleCostSatang: String(row.sale_cost_satang ?? '0'),
    engineerCostSatang: String(row.engineer_cost_satang ?? '0'),
    entertainCostSatang: String(row.entertain_cost_satang ?? '0'),
    hiddenCostSatang: String(row.hidden_cost_satang ?? '0'),
    saleCommissionSatang: String(row.sale_commission_satang ?? '0'),
  }));
}

export async function financeProjectProfits(
  actor: Actor,
  limit = 500,
): Promise<ProjectProfitSummary> {
  requireRole(actor, 'finance', 'admin');
  const [financials, actual] = await Promise.all([
    financialGroups(limit),
    financeProjectCosts(actor, limit),
  ]);
  const actualById = new Map(actual.rows.map((row) => [row.projectId, row]));
  const rows = financials.map((row) => mergeProfit(row, actualById.get(row.id)));

  return {
    rows,
    totalRevenueSatang: rows.reduce((sum, row) => sum + BigInt(row.revenueSatang), 0n).toString(),
    totalPlannedCostSatang: rows
      .reduce((sum, row) => sum + BigInt(row.plannedCostSatang), 0n)
      .toString(),
    totalMarginSatang: rows.reduce((sum, row) => sum + BigInt(row.marginSatang), 0n).toString(),
    totalOtSatang: rows.reduce((sum, row) => sum + BigInt(row.otSatang), 0n).toString(),
    totalExpenseSatang: rows.reduce((sum, row) => sum + BigInt(row.expenseSatang), 0n).toString(),
    totalTravelSatang: rows.reduce((sum, row) => sum + BigInt(row.travelSatang), 0n).toString(),
    totalSatang: rows.reduce((sum, row) => sum + BigInt(row.totalSatang), 0n).toString(),
    pendingHead: rows.reduce((sum, row) => sum + row.pendingHead, 0),
    pendingFinance: rows.reduce((sum, row) => sum + row.pendingFinance, 0),
  };
}

export async function financeProjectProfitDetail(
  actor: Actor,
  projectId: string,
): Promise<ProjectProfitDetail | null> {
  requireRole(actor, 'finance', 'admin');
  const base = await financeProjectCostDetail(actor, projectId);
  if (!base) return null;

  const [target] = await db().unsafe(
    `select ${groupKeySql} as group_key from project_references where id=$1 limit 1`,
    [projectId],
  );
  if (!target) return null;
  const groupKey = String(target.group_key);
  const [row] = await db().unsafe(
    `
      select
        (array_agg(id order by source_item_id,id))[1] as id,
        (array_agg(code order by source_item_id,id))[1] as code,
        (array_agg(name order by source_item_id,id))[1] as name,
        (array_agg(customer order by source_item_id,id))[1] as customer,
        (array_agg(cost_center order by source_item_id,id))[1] as cost_center,
        (array_agg(po_number order by source_item_id,id))[1] as po_number,
        count(*)::integer as line_count,
        case when bool_or(status='active') then 'active' else 'inactive' end as status,
        coalesce(sum(revenue_satang),0)::text as revenue_satang,
        coalesce(sum(sale_cost_satang),0)::text as sale_cost_satang,
        coalesce(sum(engineer_cost_satang),0)::text as engineer_cost_satang,
        coalesce(sum(entertain_cost_satang),0)::text as entertain_cost_satang,
        coalesce(sum(hidden_cost_satang),0)::text as hidden_cost_satang,
        coalesce(sum(sale_commission_satang),0)::text as sale_commission_satang
      from project_references
      where ${groupKeySql}=$1
      group by ${groupKeySql}
    `,
    [groupKey],
  );
  if (!row) return null;

  const financial: FinancialGroup = {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    customer: row.customer ? String(row.customer) : null,
    costCenter: row.cost_center ? String(row.cost_center) : null,
    poNumber: row.po_number ? String(row.po_number) : null,
    lineCount: Number(row.line_count ?? 1),
    status: String(row.status),
    revenueSatang: String(row.revenue_satang ?? '0'),
    saleCostSatang: String(row.sale_cost_satang ?? '0'),
    engineerCostSatang: String(row.engineer_cost_satang ?? '0'),
    entertainCostSatang: String(row.entertain_cost_satang ?? '0'),
    hiddenCostSatang: String(row.hidden_cost_satang ?? '0'),
    saleCommissionSatang: String(row.sale_commission_satang ?? '0'),
  };

  return {
    project: base.project,
    cost: mergeProfit(financial, base.cost),
    activities: base.activities,
  };
}
