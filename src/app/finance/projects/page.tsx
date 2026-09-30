import Link from 'next/link';
import { AppShell, Money } from '@/components/AppShell';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { financeProjectCosts } from '@/server/project-reporting';

export const dynamic = 'force-dynamic';

export default async function ProjectCostsPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance');
  const report = await financeProjectCosts();

  return (
    <AppShell
      actor={actor}
      title="ต้นทุนตามโครงการ"
      description="สรุปต้นทุนที่มีหลักฐานธุรกรรมแล้ว โดยไม่รวมเงินทดรองเป็นต้นทุน"
    >
      <section className="section">
        <div className="metric-row" aria-label="สรุปต้นทุนโครงการ">
          <div className="metric">
            <strong>
              <Money satang={report.totalOtSatang} />
            </strong>
            <span>OT ใน Payroll</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={report.totalExpenseSatang} />
            </strong>
            <span>Expense ที่ตรวจแล้ว</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={report.totalTravelSatang} />
            </strong>
            <span>Travel Settlement</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={report.totalSatang} />
            </strong>
            <span>รวมที่ติดตามได้</span>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-header">
          <div>
            <h2>Project Cost Ledger</h2>
            <p>
              OT จาก Payroll, Expense จาก payable และ Travel จาก Settlement ที่ Finance ตรวจแล้ว
            </p>
          </div>
          <div>
            รออนุมัติ {report.pendingHead} · รอ Finance {report.pendingFinance}
          </div>
        </div>
        {report.rows.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">ต้นทุนที่ติดตามได้ตามโครงการ</caption>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>ลูกค้า</th>
                  <th>Cost Center</th>
                  <th className="amount">OT</th>
                  <th className="amount">Expense</th>
                  <th className="amount">Travel</th>
                  <th className="amount">รวม</th>
                  <th>คิวค้าง</th>
                  <th>ล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.projectId}>
                    <td>
                      <Link href={`/finance/projects/${row.projectId}`}>
                        <strong>{row.poNumber ? `PO ${row.poNumber}` : row.code}</strong>
                        <br />
                        <span>{row.name}</span>
                        {row.lineCount > 1 ? (
                          <span className="cell-secondary">
                            {row.lineCount} source lines · {row.code}
                          </span>
                        ) : row.poNumber ? (
                          <span className="cell-secondary">{row.code}</span>
                        ) : null}
                      </Link>
                    </td>
                    <td>{row.customer ?? '-'}</td>
                    <td>{row.costCenter ?? '-'}</td>
                    <td className="amount">
                      <Money satang={row.otSatang} />
                    </td>
                    <td className="amount">
                      <Money satang={row.expenseSatang} />
                    </td>
                    <td className="amount">
                      <Money satang={row.travelSatang} />
                    </td>
                    <td className="amount">
                      <Money satang={row.totalSatang} />
                    </td>
                    <td>
                      Head {row.pendingHead} · Finance {row.pendingFinance}
                    </td>
                    <td>
                      {row.latestActivityAt
                        ? row.latestActivityAt.toLocaleDateString('th-TH', {
                            timeZone: 'Asia/Bangkok',
                          })
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มีต้นทุนโครงการที่พร้อมรายงาน</h2>
            <p>รายงานจะแสดงเมื่อมีรายการที่ตรวจสอบแล้วและผูกกับโครงการ</p>
          </div>
        )}
      </section>
      <section className="section">
        <div className="attention">
          <strong>ขอบเขตของรายงาน</strong>
          <p>
            เป็น Project Cost Ledger จาก Employee System ไม่ใช่งบกำไรขาดทุน และไม่สร้าง Cost Center
            ที่ต้นทางยังไม่ได้กำหนดขึ้นเอง
          </p>
        </div>
      </section>
    </AppShell>
  );
}
