import { cookies } from 'next/headers';
import { AppShell, StateLabel } from '@/components/AppShell';
import { AdminSectionNav } from '@/components/AdminConfiguration';
import { CalendarPolicyAdminClient } from './CalendarPolicyAdminClient';
import { bangkokDate } from '@/domain/calendar';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { calendarPolicyAdminState } from '@/server/policy-admin';
import { policyCenterRows } from '@/server/policy-queries';

export const dynamic = 'force-dynamic';

const familyLabels: Record<string, string> = {
  calendar: 'วันทำงาน / วันหยุด',
  leave: 'การลา',
  ot: 'OT',
  mileage: 'ค่ารถส่วนตัว',
  per_diem: 'เบี้ยเลี้ยง',
  payroll: 'Payroll / Cutoff',
  expense: 'ค่าใช้จ่าย',
  approval: 'Approval',
};

export default async function PolicyCenterPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'admin');
  const [rows, calendar] = await Promise.all([policyCenterRows(), calendarPolicyAdminState()]);
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const today = bangkokDate(new Date());
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.family) && row.status === 'published' && row.effectiveFrom <= today) {
      latest.set(row.family, row);
    }
  }

  return (
    <AppShell
      actor={actor}
      title="Policy Center"
      description="ดูและเผยแพร่นโยบายแบบ Versioned พร้อม Effective Date และประวัติ"
    >
      <AdminSectionNav />
      <section className="section">
        <div className="notice">
          <p>
            นโยบาย Published เป็นประวัติถาวร การเปลี่ยนกฎต้องสร้าง version ใหม่พร้อมวันที่เริ่มใช้
            เพื่อไม่ให้รายการเก่าเปลี่ยนย้อนหลัง
          </p>
        </div>
      </section>

      <CalendarPolicyAdminClient
        csrf={csrf}
        today={today}
        current={calendar.current}
        history={calendar.history}
      />

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Current policy families</h2>
            <p>สรุปเวอร์ชัน Published ที่มีผลแล้วของแต่ละ policy family</p>
          </div>
        </div>
        <div className="data-table-wrap" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th>นโยบาย</th>
                <th>Version</th>
                <th>มีผลตั้งแต่</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {[...latest.values()].map((row) => (
                <tr key={row.family}>
                  <td>{familyLabels[row.family] ?? row.family}</td>
                  <td>v{row.version}</td>
                  <td>{row.effectiveFrom}</td>
                  <td>
                    <StateLabel value={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>ประวัติทั้งหมด</h2>
        <div className="data-table-wrap" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th>นโยบาย</th>
                <th>Version</th>
                <th>Effective Date</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.family}:${row.version}`}>
                  <td>{familyLabels[row.family] ?? row.family}</td>
                  <td>v{row.version}</td>
                  <td>{row.effectiveFrom}</td>
                  <td>
                    <StateLabel value={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
