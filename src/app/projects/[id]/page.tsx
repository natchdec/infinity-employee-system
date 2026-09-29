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
      title={`${project.code} · ${project.name}`}
      description={project.customer ?? 'Project Master'}
    >
      <section className="section">
        <dl className="detail-grid detail-grid-surface">
          <dt>Project Code</dt>
          <dd>{project.code}</dd>
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
