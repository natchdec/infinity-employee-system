import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell, Money, StateLabel } from '@/components/AppShell';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { financeProjectProfitDetail } from '@/server/project-profit-reporting';

export const dynamic = 'force-dynamic';

function percentLabel(basisPoints: number | null): string {
  if (basisPoints === null) return '-';
  return `${(basisPoints / 100).toFixed(2)}%`;
}

export default async function FinanceProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  requirePageRole(actor, 'finance');
  const { id } = await params;
  const detail = await financeProjectProfitDetail(id);
  if (!detail) notFound();

  const { project, cost, activities } = detail;
  const date = (value: string | null) =>
    value
      ? new Date(value + 'T00:00:00+07:00').toLocaleDateString('th-TH', {
          timeZone: 'Asia/Bangkok',
        })
      : '-';

  return (
    <AppShell
      actor={actor}
      title={project.code + ' · ' + project.name}
      description={project.customer ?? 'Project P&L detail'}
    >
      <section className="section">
        <div className="section-header">
          <div>
            <h2>Project Master</h2>
            <p>ข้อมูลจาก Microsoft Lists / SharePoint และต้นทุนจริงจาก Employee System</p>
          </div>
          <Link className="button button-secondary" href="/finance/projects">
            กลับ Project P&L
          </Link>
        </div>
        <dl className="detail-grid detail-grid-surface">
          <dt>PO Number</dt>
          <dd>{project.poNumber ?? '-'}</dd>
          <dt>Source Lines</dt>
          <dd>{project.lineCount}</dd>
          <dt>Customer</dt>
          <dd>{project.customer ?? '-'}</dd>
          <dt>Sales Owner</dt>
          <dd>{project.salesOwner ?? '-'}</dd>
          <dt>Engineer Lead</dt>
          <dd>{project.engineerLead ?? 'ไม่มีข้อมูลจากต้นทาง'}</dd>
          <dt>Start / End</dt>
          <dd>
            {date(project.startDate)} – {date(project.endDate)}
          </dd>
          <dt>Status</dt>
          <dd>
            <StateLabel value={project.status === 'active' ? 'confirmed' : 'cancelled'} />
          </dd>
          <dt>Cost Center</dt>
          <dd>{project.costCenter ?? 'ไม่มีข้อมูลจากต้นทาง'}</dd>
          <dt>Last Sync</dt>
          <dd>{project.lastSyncedAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</dd>
        </dl>
      </section>

      <section className="section">
        <div className="metric-row" aria-label="Project P&L">
          <div className="metric">
            <strong>
              <Money satang={cost.revenueSatang} />
            </strong>
            <span>Revenue</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={cost.plannedCostSatang} />
            </strong>
            <span>Planned Cost</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={cost.totalSatang} />
            </strong>
            <span>Actual Employee Cost</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={cost.marginSatang} />
            </strong>
            <span>Actual Margin · {percentLabel(cost.marginBasisPoints)}</span>
          </div>
        </div>
        <p className="field-note">
          Planned remaining <Money satang={cost.plannedRemainingSatang} /> · รอ Head{' '}
          {cost.pendingHead} · รอ Finance {cost.pendingFinance}
        </p>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Planned Cost จาก Project Master</h2>
            <p>แยกจาก Actual Cost เพื่อป้องกันการ double count</p>
          </div>
        </div>
        <div className="data-table-wrap" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ประเภท</th>
                <th className="amount">ยอด</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sale Cost</td>
                <td className="amount">
                  <Money satang={cost.saleCostSatang} />
                </td>
              </tr>
              <tr>
                <td>Engineer Cost</td>
                <td className="amount">
                  <Money satang={cost.engineerCostSatang} />
                </td>
              </tr>
              <tr>
                <td>Entertain Cost</td>
                <td className="amount">
                  <Money satang={cost.entertainCostSatang} />
                </td>
              </tr>
              <tr>
                <td>Hidden Cost</td>
                <td className="amount">
                  <Money satang={cost.hiddenCostSatang} />
                </td>
              </tr>
              <tr>
                <td>Sale Commission</td>
                <td className="amount">
                  <Money satang={cost.saleCommissionSatang} />
                </td>
              </tr>
              <tr>
                <td>
                  <strong>รวม Planned Cost</strong>
                </td>
                <td className="amount">
                  <strong>
                    <Money satang={cost.plannedCostSatang} />
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Actual Employee Cost</h2>
            <p>ธุรกรรมจริงที่ผูก Project และผ่านสถานะที่กำหนด</p>
          </div>
        </div>
        <div className="metric-row" aria-label="Actual cost breakdown">
          <div className="metric">
            <strong>
              <Money satang={cost.otSatang} />
            </strong>
            <span>OT</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={cost.expenseSatang} />
            </strong>
            <span>Expense / Mileage</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={cost.travelSatang} />
            </strong>
            <span>Travel</span>
          </div>
          <div className="metric">
            <strong>
              <Money satang={cost.totalSatang} />
            </strong>
            <span>Actual Total</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Recent activity</h2>
            <p>คำขอล่าสุดที่ผูกกับ Project นี้</p>
          </div>
        </div>
        {activities.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>รายการ</th>
                  <th>ประเภท</th>
                  <th>Workflow</th>
                  <th>Finance</th>
                  <th className="amount">ยอด</th>
                  <th>ล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link href={'/requests/' + item.id}>
                        <strong>{item.reference}</strong>
                      </Link>
                      <div className="cell-secondary">{item.title}</div>
                    </td>
                    <td>{item.kind}</td>
                    <td>{item.workflowState}</td>
                    <td>{item.financeState}</td>
                    <td className="amount">
                      <Money satang={item.totalSatang} />
                    </td>
                    <td>{item.updatedAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มีรายการ</h2>
            <p>Project นี้ยังไม่มีคำขอที่ผูกอยู่</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
