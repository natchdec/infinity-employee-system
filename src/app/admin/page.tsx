import { AppShell } from '@/components/AppShell';
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
      description="ข้อมูลพนักงาน โครงสร้างองค์กร นโยบาย และความพร้อมของ Integration"
    >
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
        <div className="section-header">
          <div>
            <h2>นโยบาย</h2>
            <p>มีนโยบาย published {summary.publishedPolicies} เวอร์ชันในฐานข้อมูลปัจจุบัน</p>
          </div>
        </div>
        <div className="notice notice-warning">
          <p>
            การตั้งค่า production เช่น Entra, Microsoft Project Master, Google Routes, Easy-ACC,
            Smartbiz และ Object Storage ต้องผ่าน readiness ของแต่ละ adapter ก่อน
            ระบบจะไม่แสดงสถานะพร้อมจากค่าตัวอย่าง
          </p>
        </div>
      </section>
    </AppShell>
  );
}
