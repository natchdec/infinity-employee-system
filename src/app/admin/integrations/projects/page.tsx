import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { AdminSectionNav } from '@/components/AdminConfiguration';
import { ProjectMasterSyncButton } from '@/components/ProjectMasterSyncButton';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { projectMasterSummary } from '@/server/project-master-view';

export const dynamic = 'force-dynamic';

export default async function ProjectIntegrationPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'admin');
  const [summary, store] = await Promise.all([projectMasterSummary(), cookies()]);
  const csrf = store.get(cookieNames().csrf)?.value ?? '';

  return (
    <AppShell
      actor={actor}
      title="Project Integration"
      description="Microsoft Lists / SharePoint เป็น Project Master หลัก และ Employee System เก็บสำเนาอ้างอิงแบบ read-only"
    >
      <AdminSectionNav />
      <section className="section">
        <div className="metric-row" aria-label="Project Master sync summary">
          <div className="metric">
            <strong>{summary.total}</strong>
            <span>โครงการทั้งหมด</span>
          </div>
          <div className="metric">
            <strong>{summary.active}</strong>
            <span>Active</span>
          </div>
          <div className="metric">
            <strong>{summary.inactive}</strong>
            <span>Inactive</span>
          </div>
          <div className="metric">
            <strong>{summary.configured ? 'พร้อม' : 'รอตั้งค่า'}</strong>
            <span>Connection</span>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-header">
          <div>
            <h2>สถานะ Project Master</h2>
            <p>
              แก้ไข Project ที่ Microsoft Lists / SharePoint เท่านั้น ระบบเก็บ source identity, ETag
              และ Last Sync เพื่อ audit
            </p>
          </div>
        </div>
        <dl className="detail-grid detail-grid-surface">
          <dt>Authority</dt>
          <dd>Microsoft Lists / SharePoint</dd>
          <dt>Last Sync</dt>
          <dd>
            {summary.lastSyncedAt
              ? summary.lastSyncedAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
              : '-'}
          </dd>
          <dt>Engineer Lead</dt>
          <dd>{summary.missingEngineerLead} รายการยังไม่มีข้อมูลต้นทาง</dd>
          <dt>Cost Center</dt>
          <dd>{summary.missingCostCenter} รายการยังไม่มีข้อมูลต้นทาง</dd>
          <dt>Inactive</dt>
          <dd>เก็บไว้เพื่อประวัติ แต่ไม่ให้เลือกในคำขอใหม่</dd>
        </dl>
        <ProjectMasterSyncButton csrf={csrf} enabled={summary.configured} />
      </section>
      <section className="section">
        <div className="quick-list">
          <Link className="quick-link" href="/projects">
            <strong>Project Master</strong>
            <span>ค้นหา Project, Customer, Sales Owner และตรวจข้อมูลต้นทาง</span>
          </Link>
          <Link className="quick-link" href="/finance/projects">
            <strong>Project Cost Ledger</strong>
            <span>ตรวจ OT, Expense และ Travel ที่ผูกกับแต่ละ Project</span>
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
