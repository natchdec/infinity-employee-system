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
      description="ตรวจสอบ จัดชุดการจ่าย Payroll และส่งข้อมูลบัญชีจากจุดเดียว"
    >
      <section className="finance-command-grid" aria-label="งานการเงินหลัก">
        <Link className="finance-command-card is-primary" href="/finance">
          <span className="finance-command-step">01</span>
          <span className="finance-command-copy">
            <strong>ตรวจสอบรายการ</strong>
            <small>ตรวจคำขอ ยอดเงิน และหลักฐานก่อน Finance Verify</small>
          </span>
          <span className="finance-command-metric">
            <b>{finance.pendingVerification}</b>
            <small>รอตรวจสอบ</small>
          </span>
        </Link>

        <Link className="finance-command-card" href="/finance/payments">
          <span className="finance-command-step">02</span>
          <span className="finance-command-copy">
            <strong>จัดชุดการจ่ายเงิน</strong>
            <small>รวมรายการที่ Verify แล้วเป็น Payment Batch</small>
          </span>
          <span className="finance-command-metric">
            <b>{finance.readyToPay}</b>
            <small>พร้อมจ่าย</small>
          </span>
        </Link>

        <Link className="finance-command-card" href="/finance/payroll">
          <span className="finance-command-step">03</span>
          <span className="finance-command-copy">
            <strong>OT / Payroll</strong>
            <small>ตรวจรอบ Payroll และเตรียมส่งข้อมูลไป EASY-ACC</small>
          </span>
          <span className="finance-command-action">EASY-ACC →</span>
        </Link>

        <Link className="finance-command-card" href="/finance/exports">
          <span className="finance-command-step">04</span>
          <span className="finance-command-copy">
            <strong>Accounting Export</strong>
            <small>ส่งเฉพาะรายการที่จ่ายแล้วเข้าสู่ขั้นตอนบัญชี</small>
          </span>
          <span className="finance-command-action">Smartbiz →</span>
        </Link>
      </section>

      <section className="finance-status-strip" aria-label="รายการติดตาม">
        <span>
          <strong>{finance.originalsOutstanding}</strong> รอใบเสร็จต้นฉบับ
        </span>
        <span>
          <strong>{finance.advancesOpen}</strong> เงินทดรองเปิดอยู่
        </span>
        <span>รายการของ Finance เองเป็น Read only และห้าม Verify / Paid ด้วยตนเอง</span>
      </section>

      <section className="finance-workspace finance-workspace-single">
        <div className="finance-queue">
          <div className="section-header">
            <div>
              <h2>รายการที่ต้องตรวจสอบ</h2>
              <p>
                เริ่มจากคิวนี้ก่อน แล้วรายการที่ผ่าน Finance Verify จะย้ายไปขั้นจัดชุดการจ่ายเงิน
              </p>
            </div>
            <Link className="button button-secondary" href="/finance/payments">
              ไปชุดการจ่ายเงิน
            </Link>
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
      </section>

      <section className="section finance-tools-section">
        <div className="section-header">
          <div>
            <h2>เครื่องมือเพิ่มเติม</h2>
            <p>งานปิดรอบ เอกสาร และการตรวจสอบที่ไม่จำเป็นต้องอยู่ในคิวหลัก</p>
          </div>
        </div>
        <nav className="finance-tools-grid" aria-label="เครื่องมือการเงินเพิ่มเติม">
          <Link href="/finance/settlements">
            <strong>Settlement</strong>
            <span>เคลียร์เงินทดรองและค่าใช้จ่ายทริป</span>
          </Link>
          <Link href="/finance/receipts">
            <strong>ใบเสร็จต้นฉบับ</strong>
            <span>ติดตามเอกสารจริงที่ยังค้าง</span>
          </Link>
          <Link href="/finance/projects">
            <strong>Project P&amp;L</strong>
            <span>Revenue / Planned / Actual / Margin</span>
          </Link>
          <Link href="/finance/reconciliation">
            <strong>Reconciliation</strong>
            <span>เทียบยอดกับรายการจ่ายและบัญชี</span>
          </Link>
          <Link href="/finance/monthly-close">
            <strong>Monthly Closing</strong>
            <span>ตรวจ readiness ก่อนปิดรอบ</span>
          </Link>
          <Link href="/finance/operations">
            <strong>Operations</strong>
            <span>ตรวจงานค้างและ exception ฝั่ง Finance</span>
          </Link>
        </nav>
      </section>
    </AppShell>
  );
}
