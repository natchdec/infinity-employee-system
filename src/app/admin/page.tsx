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
      description="กำหนดสิทธิ์พนักงาน โครงสร้างผู้อนุมัติ และตรวจ Approval Rules ที่ระบบบังคับใช้"
    >
      <AdminSectionNav />
      <section className="section">
        <div className="metric-row" aria-label="โครงสร้างที่ตั้งค่าแล้ว">
          <div className="metric">
            <strong>{summary.employees}</strong>
            <span>พนักงานที่เปิดใช้งาน</span>
          </div>
          <div className="metric">
            <strong>{summary.heads}</strong>
            <span>Head</span>
          </div>
          <div className="metric">
            <strong>{summary.finance}</strong>
            <span>Finance</span>
          </div>
          <div className="metric">
            <strong>{summary.departments}</strong>
            <span>แผนก</span>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="quick-list admin-quick-list">
          <Link className="quick-link" href="/admin/employees">
            <strong>พนักงานและสิทธิ์</strong>
            <span>Role, Head/Owner, Department และสถานะบัญชี</span>
          </Link>
          <Link className="quick-link" href="/admin/directory">
            <strong>Microsoft 365 Directory</strong>
            <span>Sync บัญชีจาก Office 365 และตรวจการผูกกับ Employee</span>
          </Link>
          <Link className="quick-link" href="/admin/organization">
            <strong>โครงสร้างองค์กร</strong>
            <span>Department และ Reporting Line แบบมี Effective Date</span>
          </Link>
          <Link className="quick-link" href="/admin/approval-rules">
            <strong>Approval Rules</strong>
            <span>ดู Manager / Finance / Payroll routing และ policy version</span>
          </Link>
        </div>
      </section>
      <section className="section">
        <div className="notice notice-warning">
          <p>
            การเปลี่ยน Reporting Line มีผลกับคำขอใหม่เท่านั้น คำขอที่ส่งแล้วเก็บ Head snapshot เดิม
            และ Finance ไม่สามารถตรวจหรือจ่ายรายการของตนเองได้แม้มี Admin role.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
