import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';
import { listProjectMaster, projectMasterSummary } from '@/server/project-master-view';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ q?: string; status?: string }>;
}

export default async function ProjectsPage({ searchParams }: Props) {
  const actor = await requireActor();
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const status =
    params.status === 'inactive' ? 'inactive' : params.status === 'all' ? 'all' : 'active';
  const [summary, projects] = await Promise.all([
    projectMasterSummary(),
    listProjectMaster(q, status),
  ]);

  return (
    <AppShell
      actor={actor}
      title="Project Master"
      description="โครงการอ้างอิงจาก Microsoft Lists / SharePoint"
    >
      <section className="section">
        <form className="filterbar" method="get">
          <input
            name="q"
            defaultValue={q}
            aria-label="ค้นหา Project"
            placeholder="Project code, ชื่อ, ลูกค้า หรือ Sales Owner"
          />
          <select name="status" defaultValue={status} aria-label="สถานะ Project">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">ทั้งหมด</option>
          </select>
          <button className="button button-secondary" type="submit">
            ค้นหา
          </button>
        </form>
        <p className="field-note">
          {summary.total} projects · sync ล่าสุด{' '}
          {summary.lastSyncedAt
            ? summary.lastSyncedAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
            : 'ยังไม่มี'}
        </p>
      </section>
      <section className="section">
        {projects.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>ลูกค้า</th>
                  <th>Sales Owner</th>
                  <th>ช่วงเวลา</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <Link href={`/projects/${project.id}`}>
                        <strong>{project.code}</strong>
                        <br />
                        <span>{project.name}</span>
                      </Link>
                    </td>
                    <td>{project.customer ?? '-'}</td>
                    <td>{project.salesOwner ?? '-'}</td>
                    <td>
                      {project.startDate ?? '-'} → {project.endDate ?? '-'}
                    </td>
                    <td>
                      <span
                        className={project.status === 'active' ? 'state state-success' : 'state'}
                      >
                        {project.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ไม่พบ Project</h2>
            <p>ลองเปลี่ยนคำค้นหาหรือสถานะ</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
