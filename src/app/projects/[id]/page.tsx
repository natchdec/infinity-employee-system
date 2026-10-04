import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell, Money } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';
import { projectMasterDetail } from '@/server/project-master-view';
import { financeProjectProfitDetail } from '@/server/project-profit-reporting';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

function linePlannedCost(line: {
  saleCostSatang: string;
  engineerCostSatang: string;
  entertainCostSatang: string;
  hiddenCostSatang: string;
  saleCommissionSatang: string;
}): string {
  return (
    BigInt(line.saleCostSatang) +
    BigInt(line.engineerCostSatang) +
    BigInt(line.entertainCostSatang) +
    BigInt(line.hiddenCostSatang) +
    BigInt(line.saleCommissionSatang)
  ).toString();
}

function percentLabel(basisPoints: number | null): string {
  if (basisPoints === null) return '-';
  return `${(basisPoints / 100).toFixed(2)}%`;
}

export default async function ProjectDetailPage({ params }: Props) {
  const actor = await requireActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canViewFinancials = actor.roles.includes('finance') || actor.roles.includes('admin');
  const project = await projectMasterDetail(actor, id);
  if (!project) notFound();

  const profit = canViewFinancials ? await financeProjectProfitDetail(actor, project.id) : null;

  return (
    <AppShell
      actor={actor}
      title={
        project.poNumber
          ? `PO ${project.poNumber} · ${project.name}`
          : `${project.code} · ${project.name}`
      }
      description={project.customer ?? 'Project Master'}
    >
      <section className="section">
        <dl className="detail-grid detail-grid-surface">
          <dt>PO Number</dt>
          <dd>{project.poNumber ?? '-'}</dd>
          <dt>Project Code</dt>
          <dd>{project.code}</dd>
          <dt>Source Lines</dt>
          <dd>{project.lineCount}</dd>
          <dt>PO Date</dt>
          <dd>{project.poDate ?? '-'}</dd>
          <dt>PO Create Date</dt>
          <dd>{project.poCreateDate ?? '-'}</dd>
          <dt>Customer</dt>
          <dd>{project.customer ?? '-'}</dd>
          <dt>Sales Owner</dt>
          <dd>{project.salesOwner ?? '-'}</dd>
          <dt>Engineer Lead</dt>
          <dd>{project.engineerLead ?? 'ยังไม่มีข้อมูลจากต้นทาง'}</dd>
          <dt>Start / End</dt>
          <dd>
            {project.startDate ?? '-'} → {project.endDate ?? '-'}
          </dd>
          <dt>Status</dt>
          <dd>{project.status}</dd>
          {canViewFinancials ? (
            <>
              <dt>Cost Center</dt>
              <dd>{project.costCenter ?? 'ยังไม่มีข้อมูลจากต้นทาง'}</dd>
            </>
          ) : null}
          <dt>Source</dt>
          <dd>Microsoft Lists / SharePoint</dd>
          <dt>Last Sync</dt>
          <dd>{project.lastSyncedAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</dd>
          <dt>ETag</dt>
          <dd>
            <code>{project.sourceEtag ?? '-'}</code>
          </dd>
        </dl>
      </section>

      {canViewFinancials ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Project Financials</h2>
              <p>
                Revenue และ Planned Cost มาจาก Microsoft Lists; Actual Employee Cost
                มาจากรายการที่ผูก Project ใน Employee System
              </p>
            </div>
            <Link className="button button-secondary" href={`/finance/projects/${project.id}`}>
              เปิด Project Cost Ledger
            </Link>
          </div>
          <div className="metric-row" aria-label="Project financial summary">
            <div className="metric">
              <strong>
                <Money satang={project.revenueSatang} />
              </strong>
              <span>Revenue</span>
            </div>
            <div className="metric">
              <strong>
                <Money satang={project.plannedCostSatang} />
              </strong>
              <span>Planned Cost</span>
            </div>
            <div className="metric">
              <strong>
                <Money satang={profit?.cost.totalSatang ?? '0'} />
              </strong>
              <span>Actual Employee Cost</span>
            </div>
            <div className="metric">
              <strong>
                <Money
                  satang={
                    profit?.cost.marginSatang ??
                    (BigInt(project.revenueSatang) - BigInt(project.plannedCostSatang)).toString()
                  }
                />
              </strong>
              <span>
                Current Margin
                {profit ? ` · ${percentLabel(profit.cost.marginBasisPoints)}` : ''}
              </span>
            </div>
          </div>
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">Planned cost breakdown จาก Project Master</caption>
              <thead>
                <tr>
                  <th>Sale Cost</th>
                  <th>Engineer Cost</th>
                  <th>Entertain Cost</th>
                  <th>Hidden Cost</th>
                  <th>Sale Commission</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <Money satang={project.saleCostSatang} />
                  </td>
                  <td>
                    <Money satang={project.engineerCostSatang} />
                  </td>
                  <td>
                    <Money satang={project.entertainCostSatang} />
                  </td>
                  <td>
                    <Money satang={project.hiddenCostSatang} />
                  </td>
                  <td>
                    <Money satang={project.saleCommissionSatang} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {project.lines.length > 1 ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>รายการภายใต้ PO เดียวกัน</h2>
              <p>
                Software / Hardware / Service หรือรายการอื่นจาก SharePoint ยังคงแยกเป็น source line
                เพื่อ audit
              </p>
            </div>
          </div>
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project Code</th>
                  <th>รายการ</th>
                  <th>ช่วงเวลา</th>
                  <th>สถานะ</th>
                  {canViewFinancials ? (
                    <>
                      <th className="amount">Revenue</th>
                      <th className="amount">Planned Cost</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {project.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.code}</td>
                    <td>{line.name}</td>
                    <td>
                      {line.startDate ?? '-'} → {line.endDate ?? '-'}
                    </td>
                    <td>{line.status}</td>
                    {canViewFinancials ? (
                      <>
                        <td className="amount">
                          <Money satang={line.revenueSatang} />
                        </td>
                        <td className="amount">
                          <Money satang={linePlannedCost(line)} />
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
