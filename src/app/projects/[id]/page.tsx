import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';
import { projectMasterDetail } from '@/server/project-master-view';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const actor = await requireActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const project = await projectMasterDetail(id);
  if (!project) notFound();

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
          <dt>Cost Center</dt>
          <dd>{project.costCenter ?? 'ยังไม่มีข้อมูลจากต้นทาง'}</dd>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {actor.roles.includes('finance') ? (
        <section className="section">
          <Link className="button button-secondary" href={`/finance/projects/${project.id}`}>
            ดูต้นทุนโครงการ
          </Link>
        </section>
      ) : null}
    </AppShell>
  );
}
