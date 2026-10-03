import { bangkokDate } from '../domain/calendar';
import type { Json } from '../domain/core';
import { db, safeJson } from './db';

export interface AdjustmentQueueRow {
  id: string;
  ownerId: string;
  ownerName: string;
  sourceType: string;
  sourceId: string;
  sourceRound: number | null;
  targetMonth: string;
  reason: string;
  delta: Json;
  state: string;
  revision: number;
  assignedHeadId: string | null;
  createdAt: Date;
}

function mapAdjustment(row: Record<string, unknown>): AdjustmentQueueRow {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    ownerName: String(row.display_name),
    sourceType: String(row.source_type),
    sourceId: String(row.source_id),
    sourceRound: row.source_round == null ? null : Number(row.source_round),
    targetMonth: String(row.target_month),
    reason: String(row.reason),
    delta: safeJson(row.delta),
    state: String(row.state),
    revision: Number(row.revision),
    assignedHeadId: row.assigned_head_id ? String(row.assigned_head_id) : null,
    createdAt: new Date(String(row.created_at)),
  };
}

export async function financeAdjustmentQueue(): Promise<AdjustmentQueueRow[]> {
  const rows = await db()`
    select a.*,e.display_name
    from adjustments a
    join employees e on e.id=a.owner_id
    order by
      case a.state
        when 'finance_pending' then 0
        when 'verified' then 1
        when 'pending_head' then 2
        else 3
      end,
      a.created_at desc
    limit 200
  `;
  return rows.map((row) => mapAdjustment(row as Record<string, unknown>));
}

export async function assignedAdjustmentApprovals(headId: string): Promise<AdjustmentQueueRow[]> {
  const date = bangkokDate(new Date());
  const rows = await db()`
    select a.*,e.display_name
    from adjustments a
    join employees e on e.id=a.owner_id
    where a.state='pending_head'
      and (
        a.assigned_head_id=${headId}
        or exists(
          select 1
          from approval_delegations d
          where d.active
            and d.scope='manager_approval'
            and d.delegator_id=a.assigned_head_id
            and d.delegate_id=${headId}
            and d.effective_from <= ${date}::date
            and d.effective_to >= ${date}::date
        )
      )
    order by a.created_at,a.id
    limit 100
  `;
  return rows.map((row) => mapAdjustment(row as Record<string, unknown>));
}
