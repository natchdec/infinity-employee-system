import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { operationsDashboard } from '@/server/operations-dashboard';

export const dynamic = 'force-dynamic';

function bangkokDateTime(value: Date | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function jobStateClass(state: string): string {
  if (state === 'failed' || state === 'blocked') return 'state state-danger';
  if (state === 'queued' || state === 'running') return 'state state-warning';
  if (state === 'succeeded') return 'state state-success';
  return 'state state-neutral';
}

export default async function FinanceOperationsPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance');
  const dashboard = await operationsDashboard();

  return (
    <AppShell
      actor={actor}
      title="Operational Dashboard"
      description="มุมมองรวมคิวอนุมัติ งานการเงิน งานรายเดือน และสุขภาพ worker สำหรับการติดตามประจำวัน"
    >
      <section className="section">
        <div className="metric-row" aria-label="สรุป operational queue">
          <div className="metric">
            <strong>{dashboard.pendingHead}</strong>
            <span>รอ Head อนุมัติ</span>
          </div>
          <div className="metric">
            <strong>{dashboard.pendingFinance}</strong>
            <span>รอ Finance ตรวจ</span>
          </div>
          <div className="metric">
            <strong>{dashboard.unpaidPayables}</strong>
            <span>Payable ยังไม่จ่าย</span>
          </div>
          <div className="metric">
            <strong>{dashboard.worklogReview}</strong>
            <span>Worklog ต้องตรวจ</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="metric-row" aria-label="สรุป exception และ closing">
          <div className="metric">
            <strong>{dashboard.overdueSettlements}</strong>
            <span>Settlement เกินกำหนด</span>
          </div>
          <div className="metric">
            <strong>{dashboard.receiptGaps}</strong>
            <span>รอใบเสร็จต้นฉบับ</span>
          </div>
          <div className="metric">
            <strong>{dashboard.failedJobs + dashboard.blockedJobs}</strong>
            <span>Job failed / blocked</span>
          </div>
          <div className="metric">
            <strong>{dashboard.closingPeriods}</strong>
            <span>งวดอยู่ระหว่าง Closing</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Worker และ Background Jobs</h2>
            <p>ใช้ดูว่าการ sync, reminder และ notification pipeline ยังประมวลผลตามปกติหรือไม่</p>
          </div>
          <span
            className={dashboard.latestWorkerFresh ? 'state state-success' : 'state state-danger'}
          >
            {dashboard.latestWorkerFresh ? 'Worker online' : 'Worker stale'}
          </span>
        </div>
        <dl className="detail-grid detail-grid-surface">
          <dt>Worker</dt>
          <dd>{dashboard.latestWorkerId ?? '-'}</dd>
          <dt>State</dt>
          <dd>{dashboard.latestWorkerState ?? '-'}</dd>
          <dt>Last seen</dt>
          <dd>{bangkokDateTime(dashboard.latestWorkerSeenAt)}</dd>
          <dt>Failed</dt>
          <dd>{dashboard.failedJobs}</dd>
          <dt>Blocked</dt>
          <dd>{dashboard.blockedJobs}</dd>
        </dl>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Job activity 7 วัน</h2>
            <p>สรุปตามชนิดงานและสถานะ เพื่อไล่ปัญหาโดยไม่ต้องเปิดฐานข้อมูลโดยตรง</p>
          </div>
          <Link className="text-link" href="/finance/reconciliation">
            เปิด Reconciliation
          </Link>
        </div>
        {dashboard.jobStats.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">Background job activity 7 วัน</caption>
              <thead>
                <tr>
                  <th>Job kind</th>
                  <th>State</th>
                  <th className="amount">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.jobStats.map((item) => (
                  <tr key={`${item.kind}:${item.state}`}>
                    <td>{item.kind}</td>
                    <td>
                      <span className={jobStateClass(item.state)}>{item.state}</span>
                    </td>
                    <td className="amount">{item.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มี Job activity</h2>
            <p>เมื่อ worker ประมวลผลงาน ตารางนี้จะแสดงสถิติย้อนหลัง 7 วัน</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
