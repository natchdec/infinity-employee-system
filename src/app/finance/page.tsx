import Link from 'next/link';
import { AppShell, Money, StateLabel } from '@/components/AppShell';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { financeOverview } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance');
  const finance = await financeOverview();

  return (
    <AppShell
      actor={actor}
      title="งานการเงิน"
      description="คิวตรวจสอบ การจ่ายเงิน ใบเสร็จต้นฉบับ และเงินทดรอง แยกสถานะออกจากกัน"
    >
      <section className="section">
        <div className="metric-row" aria-label="สรุปคิวการเงิน">
          <div className="metric">
            <strong>{finance.pendingVerification}</strong>
            <span>รอตรวจสอบ</span>
          </div>
          <div className="metric">
            <strong>{finance.readyToPay}</strong>
            <span>พร้อมจ่าย</span>
          </div>
          <div className="metric">
            <strong>{finance.originalsOutstanding}</strong>
            <span>รอต้นฉบับ</span>
          </div>
          <div className="metric">
            <strong>{finance.advancesOpen}</strong>
            <span>เงินทดรองเปิดอยู่</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="finance-links">
          <Link href="/finance/payments">ชุดการจ่ายเงิน</Link>
          <Link href="/finance/settlements">Settlement</Link>
          <Link href="/finance/receipts">ใบเสร็จต้นฉบับ</Link>
          <Link href="/finance/payroll">OT / Payroll</Link>
          <Link href="/finance/projects">ต้นทุนตามโครงการ</Link>
          <Link href="/finance/reconciliation">Reconciliation</Link>
          <Link href="/finance/monthly-close">Monthly Closing</Link>
          <Link href="/finance/exports">ส่งออก</Link>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>คิวรายการ</h2>
            <p>รายการของคุณเองอ่านได้ แต่ห้ามตรวจสอบหรือบันทึกการจ่ายด้วยตนเอง</p>
          </div>
        </div>
        {finance.rows.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">คิวงานการเงิน</caption>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>พนักงาน</th>
                  <th>เรื่อง</th>
                  <th>การเงิน</th>
                  <th>ต้นฉบับ</th>
                  <th>การจ่าย</th>
                  <th className="amount">ยอด</th>
                  <th>ข้อควบคุม</th>
                </tr>
              </thead>
              <tbody>
                {finance.rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="text-link" href={`/requests/${item.id}`}>
                        {item.reference}
                      </Link>
                    </td>
                    <td>{item.employeeName}</td>
                    <td>{item.title}</td>
                    <td>
                      <StateLabel value={item.financeState} />
                    </td>
                    <td>{item.originalState ? <StateLabel value={item.originalState} /> : '-'}</td>
                    <td>
                      {item.paymentState === 'not_applicable' ? (
                        '-'
                      ) : (
                        <StateLabel value={item.paymentState} />
                      )}
                    </td>
                    <td className="amount">
                      <Money satang={item.totalSatang} />
                    </td>
                    <td>
                      {item.employeeId === actor.id ? (
                        <span className="state state-warning">ห้ามทำรายการของตนเอง</span>
                      ) : (
                        'ผู้มีสิทธิ์ดำเนินการได้'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ไม่มีรายการในคิว</h2>
            <p>เมื่อมีคำขอที่ถึงขั้นการเงิน รายการจะปรากฏตามสถานะจริง</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
