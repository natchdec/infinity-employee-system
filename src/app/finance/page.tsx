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
      description="คิวตรวจสอบ การจ่ายเงิน ใบเสร็จต้นฉบับ และเงินทดรอง"
    >
      <section className="finance-status-strip" aria-label="สรุปงานวันนี้">
        <span>
          <strong>{finance.pendingVerification}</strong> รอตรวจสอบ
        </span>
        <span>
          <strong>{finance.readyToPay}</strong> พร้อมจ่าย
        </span>
        <span>
          <strong>{finance.originalsOutstanding}</strong> รอต้นฉบับ
        </span>
        <span>
          <strong>{finance.advancesOpen}</strong> เงินทดรองเปิดอยู่
        </span>
      </section>

      <section className="finance-workspace">
        <div className="finance-queue">
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
                      <td>
                        {item.employeeName}
                        {item.employeeId === actor.id ? (
                          <span className="cell-secondary">รายการของคุณ · read only</span>
                        ) : null}
                      </td>
                      <td>{item.title}</td>
                      <td>
                        <StateLabel value={item.financeState} />
                      </td>
                      <td>
                        {item.originalState ? <StateLabel value={item.originalState} /> : '-'}
                      </td>
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
        </div>

        <aside className="finance-workflow-nav" aria-label="งานการเงิน">
          <h2>งานการเงิน</h2>
          <Link href="/finance/payments">
            <span>ชุดการจ่ายเงิน</span>
            <b>›</b>
          </Link>
          <Link href="/finance/settlements">
            <span>Settlement</span>
            <b>›</b>
          </Link>
          <Link href="/finance/receipts">
            <span>ใบเสร็จต้นฉบับ</span>
            <b>›</b>
          </Link>
          <Link href="/finance/payroll">
            <span>OT / Payroll</span>
            <b>›</b>
          </Link>
          <Link href="/finance/projects">
            <span>Project P&amp;L</span>
            <b>›</b>
          </Link>
          <Link href="/finance/reconciliation">
            <span>Reconciliation</span>
            <b>›</b>
          </Link>
          <Link href="/finance/monthly-close">
            <span>Monthly Closing</span>
            <b>›</b>
          </Link>
          <Link href="/finance/exports">
            <span>Accounting Export</span>
            <b>›</b>
          </Link>
          <Link href="/finance/operations">
            <span>Operations</span>
            <b>›</b>
          </Link>
        </aside>
      </section>
    </AppShell>
  );
}
