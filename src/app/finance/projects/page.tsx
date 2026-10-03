import Link from 'next/link';
import { AppShell, Money } from '@/components/AppShell';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { financeProjectProfits } from '@/server/project-profit-reporting';

export const dynamic = 'force-dynamic';

function percentLabel(basisPoints: number | null): string {
  if (basisPoints === null) return '-';
  return `${(basisPoints / 100).toFixed(2)}%`;
}

export default async function ProjectCostsPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance', 'admin');
  const report = await financeProjectProfits();

  return (
    <AppShell
      actor={actor}
      title="Project P&L"
      description="เทียบ Revenue / Planned Cost จาก Project Master กับต้นทุนจริงที่เกิดใน Employee System"
    >
      <section className="section">
        <div className="metric-row" aria-label="สรุป Project P&L">
          <div className="metric">
            <strong>
              <Money satang={report.totalRevenueSatang} />
            </strong>
            <span>Revenue</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={report.totalPlannedCostSatang} />
            </strong>
            <span>Planned Cost</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={report.totalSatang} />
            </strong>
            <span>Actual Employee Cost</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={report.totalMarginSatang} />
            </strong>
            <span>Actual Margin</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Project P&L Ledger</h2>
            <p>
              Revenue / planned cost มาจาก Microsoft Lists; Actual Cost มาจาก OT, Expense และ Travel
              ที่มีหลักฐานในระบบ
            </p>
          </div>
          <div>
            รออนุมัติ {report.pendingHead} · รอ Finance {report.pendingFinance}
          </div>
        </div>

        {report.rows.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">Project P&L ตาม PO / Project</caption>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>ลูกค้า</th>
                  <th className="amount">Revenue</th>
                  <th className="amount">Planned</th>
                  <th className="amount">Actual</th>
                  <th className="amount">Margin</th>
                  <th className="amount">Margin %</th>
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
                    <td className="amount">
                      <Money satang={row.revenueSatang} />
                    </td>
                    <td className="amount">
                      <Money satang={row.plannedCostSatang} />
                    </td>
                    <td className="amount">
                      <Money satang={row.totalSatang} />
                    </td>
                    <td className="amount">
                      <Money satang={row.marginSatang} />
                    </td>
                    <td className="amount">{percentLabel(row.marginBasisPoints)}</td>
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
            <h2>ยังไม่มี Project ที่พร้อมรายงาน</h2>
            <p>รายงานจะแสดงเมื่อ Project Master มีข้อมูล Revenue/Cost หรือมีต้นทุนจริงในระบบ</p>
          </div>
        )}
      </section>

      <section className="section">
        <div className="attention">
          <strong>หลักการคำนวณ</strong>
          <p>
            Planned Cost = Sale Cost + Engineer Cost + Entertain Cost + Hidden Cost + Sale
            Commission. Actual Margin = Revenue − Actual Employee Cost. ค่า planned และ actual
            ถูกแสดงแยกกันเพื่อไม่ให้ double count
          </p>
        </div>
      </section>
    </AppShell>
  );
}
