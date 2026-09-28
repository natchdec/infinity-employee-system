import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { financeReconciliation } from '@/server/finance-reconciliation';

export const dynamic = 'force-dynamic';

export default async function FinanceReconciliationPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance');
  const report = await financeReconciliation();
  const blocking = report.issues.filter((issue) => issue.severity === 'blocking').length;

  return (
    <AppShell
      actor={actor}
      title="Finance Reconciliation"
      description="ตรวจความสอดคล้องระหว่าง Settlement, Payable, Payment Batch, Payroll, ใบเสร็จ และ Export ก่อนปิดงวด"
    >
      <section className="section">
        <div className="metric-row" aria-label="สรุป reconciliation">
          <div className="metric">
            <strong>{blocking}</strong>
            <span>Blocking issues</span>
          </div>
          <div className="metric">
            <strong>{report.overdueSettlements}</strong>
            <span>Settlement เกินกำหนด</span>
          </div>
          <div className="metric">
            <strong>{report.paidReceiptGaps}</strong>
            <span>จ่ายแล้วรอต้นฉบับ</span>
          </div>
          <div className="metric">
            <strong>{report.payrollPastCutoff}</strong>
            <span>Payroll ผ่าน cutoff</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Integrity checks</h2>
            <p>
              Payable ที่ allocated/paid ต้องมี Payment Batch ที่สอดคล้องกัน
              และรายการปลายงวดต้องมีหลักฐานต่อเนื่อง
            </p>
          </div>
        </div>
        <div className="metric-row">
          <div className="metric">
            <strong>{report.allocatedOrphans}</strong>
            <span>Allocated orphan</span>
          </div>
          <div className="metric">
            <strong>{report.paidOrphans}</strong>
            <span>Paid orphan</span>
          </div>
          <div className="metric">
            <strong>{report.failedExports}</strong>
            <span>Export failed 30 วัน</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>รายการที่ต้องจัดการ</h2>
            <p>เรียง Blocking ก่อน Review เพื่อให้ Finance ปิดประเด็นสำคัญก่อนปิดงวด</p>
          </div>
        </div>
        {report.issues.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">รายการ Finance reconciliation</caption>
              <thead>
                <tr>
                  <th>ระดับ</th>
                  <th>รายการ</th>
                  <th>รายละเอียด</th>
                  <th>ไปที่</th>
                </tr>
              </thead>
              <tbody>
                {report.issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <span
                        className={`state ${issue.severity === 'blocking' ? 'state-danger' : 'state-warning'}`}
                      >
                        {issue.severity === 'blocking' ? 'Blocking' : 'Review'}
                      </span>
                    </td>
                    <td>{issue.title}</td>
                    <td>{issue.detail}</td>
                    <td>
                      <Link className="text-link" href={issue.href}>
                        เปิดคิว
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>Reconciliation ไม่พบประเด็นค้าง</h2>
            <p>ตรวจไม่พบ integrity issue หรือรายการปลายงวดที่เข้าเกณฑ์ในขณะนี้</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
