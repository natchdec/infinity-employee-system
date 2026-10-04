import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { AdminSectionNav } from '@/components/AdminConfiguration';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { organizationSummary } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'admin');
  const summary = await organizationSummary();

  return (
    <AppShell
      actor={actor}
      title="จัดการระบบ"
      description="พนักงาน โครงสร้างองค์กร นโยบาย และ Integration"
    >
      <AdminSectionNav />

      <section className="admin-overview-grid">
        <article className="admin-readiness">
          <div className="section-header">
            <div>
              <h2>System setup</h2>
              <p>รายการตั้งค่าหลักที่ผู้ดูแลต้องตรวจให้ครบ</p>
            </div>
          </div>
          <div className="admin-check-row">
            <span>พนักงานที่เปิดใช้งาน</span>
            <strong>{summary.employees}</strong>
          </div>
          <div className="admin-check-row">
            <span>Head / Owner</span>
            <strong>{summary.heads}</strong>
          </div>
          <div className="admin-check-row">
            <span>Finance</span>
            <strong>{summary.finance}</strong>
          </div>
          <div className="admin-check-row">
            <span>Department</span>
            <strong>{summary.departments}</strong>
          </div>
          <div className="notice notice-warning">
            <p>Reporting Line มีผลกับคำขอใหม่เท่านั้น และ Finance ห้ามตรวจหรือจ่ายรายการของตนเอง</p>
          </div>
        </article>

        <article className="admin-navigation-list">
          <div className="section-header">
            <div>
              <h2>Configuration</h2>
              <p>เลือกพื้นที่ตั้งค่าที่ต้องการจัดการ</p>
            </div>
          </div>
          <Link href="/admin/employees">
            <span>
              <strong>พนักงานและสิทธิ์</strong>
              <small>Role, Head/Owner, Department และสถานะบัญชี</small>
            </span>
            <b>›</b>
          </Link>
          <Link href="/admin/directory">
            <span>
              <strong>Microsoft 365 Directory</strong>
              <small>Sync identity และ mapping กับ Employee</small>
            </span>
            <b>›</b>
          </Link>
          <Link href="/admin/organization">
            <span>
              <strong>โครงสร้างองค์กร</strong>
              <small>Department และ Reporting Line</small>
            </span>
            <b>›</b>
          </Link>
          <Link href="/admin/policies">
            <span>
              <strong>Policy Center</strong>
              <small>Version, Effective Date และประวัติ</small>
            </span>
            <b>›</b>
          </Link>
          <Link href="/admin/approval-rules">
            <span>
              <strong>Approval Rules</strong>
              <small>Manager / Finance / Payroll routing</small>
            </span>
            <b>›</b>
          </Link>
          <Link href="/admin/integrations/projects">
            <span>
              <strong>Project Integration</strong>
              <small>SharePoint source, sync freshness และ diagnostics</small>
            </span>
            <b>›</b>
          </Link>
        </article>
      </section>
    </AppShell>
  );
}
