import { db } from './db';

export interface OperationsJobStat {
  kind: string;
  state: string;
  count: number;
}

export interface OperationsDashboard {
  pendingHead: number;
  pendingFinance: number;
  unpaidPayables: number;
  worklogReview: number;
  overdueSettlements: number;
  receiptGaps: number;
  failedJobs: number;
  blockedJobs: number;
  closingPeriods: number;
  latestWorkerId: string | null;
  latestWorkerState: string | null;
  latestWorkerSeenAt: Date | null;
  latestWorkerFresh: boolean;
  jobStats: OperationsJobStat[];
}

export async function operationsDashboard(): Promise<OperationsDashboard> {
  const [counts] = await db()`
    select
      (select count(*)::integer from requests where workflow_state='pending_head') as pending_head,
      (select count(*)::integer from requests where finance_state='pending') as pending_finance,
      (select count(*)::integer from payable_obligations where state='unpaid') as unpaid_payables,
      (
        select count(*)::integer
        from worklog_items
        where state in ('suggested','confirmed','exception')
      ) as worklog_review,
      (
        select count(*)::integer
        from settlements
        where state in ('submitted','refund_due','top_up_due')
          and due_date < (now() at time zone 'Asia/Bangkok')::date
      ) as overdue_settlements,
      (select count(*)::integer from original_receipts where state='outstanding') as receipt_gaps,
      (select count(*)::integer from jobs where state='failed') as failed_jobs,
      (select count(*)::integer from jobs where state='blocked') as blocked_jobs,
      (
        select count(*)::integer
        from monthly_operational_periods
        where state='closing'
      ) as closing_periods
  `;

  const [heartbeat] = await db()`
    select
      worker_id,
      state,
      last_seen_at,
      (last_seen_at >= now() - interval '2 minutes') as fresh
    from runtime_heartbeats
    order by last_seen_at desc
    limit 1
  `;

  const jobRows = await db()`
    select kind,state,count(*)::integer as count
    from jobs
    where created_at >= now() - interval '7 days'
    group by kind,state
    order by kind,state
  `;

  return {
    pendingHead: Number(counts?.pending_head ?? 0),
    pendingFinance: Number(counts?.pending_finance ?? 0),
    unpaidPayables: Number(counts?.unpaid_payables ?? 0),
    worklogReview: Number(counts?.worklog_review ?? 0),
    overdueSettlements: Number(counts?.overdue_settlements ?? 0),
    receiptGaps: Number(counts?.receipt_gaps ?? 0),
    failedJobs: Number(counts?.failed_jobs ?? 0),
    blockedJobs: Number(counts?.blocked_jobs ?? 0),
    closingPeriods: Number(counts?.closing_periods ?? 0),
    latestWorkerId: heartbeat?.worker_id ? String(heartbeat.worker_id) : null,
    latestWorkerState: heartbeat?.state ? String(heartbeat.state) : null,
    latestWorkerSeenAt: heartbeat?.last_seen_at ? new Date(heartbeat.last_seen_at) : null,
    latestWorkerFresh: Boolean(heartbeat?.fresh),
    jobStats: jobRows.map((row) => ({
      kind: String(row.kind),
      state: String(row.state),
      count: Number(row.count ?? 0),
    })),
  };
}
