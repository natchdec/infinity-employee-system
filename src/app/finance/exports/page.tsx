import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { AccountingExportControls } from '@/components/FinanceControls';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { financeExports } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function FinanceExportsPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance');
  const jobs = await financeExports();
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';

  return (
    <AppShell
      actor={actor}
      title="ส่งออกบัญชี"
      description="Review CSV ใช้ตรวจสอบภายใน Finance เท่านั้น ไม่ใช้ import เข้า EASY-ACC/Smartbiz; Smartbiz ใช้ Desktop Bridge บนเครื่อง Admin และ EASY-ACC ใช้ vendor API/bridge หรือ Desktop Bridge ที่ผ่าน UAT เท่านั้น"
    >
      <section className="section">
        <div className="section-header">
          <div>
            <h2>Accounting Review</h2>
            <p>เลือกช่วงวันที่จ่ายจริง</p>
          </div>
        </div>
        <AccountingExportControls csrf={csrf} />
      </section>
      <section className="section">
        <div className="section-header">
          <div>
            <h2>ประวัติ Export</h2>
            <p>
              artifact ที่ completed มี SHA256; adapter ที่ยังไม่ยืนยันจะเป็น blocked อย่างชัดเจน
            </p>
          </div>
        </div>
        {jobs.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>Adapter</th>
                  <th>Scope</th>
                  <th>สถานะ</th>
                  <th>Artifact / เหตุผล</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.createdAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</td>
                    <td>{job.adapter}</td>
                    <td>{job.scope}</td>
                    <td>
                      <span
                        className={`state ${job.state === 'completed' ? 'state-success' : job.state === 'blocked' ? 'state-warning' : 'state-danger'}`}
                      >
                        {job.state}
                      </span>
                    </td>
                    <td>
                      {job.artifactSha256 ? (
                        <code>{job.artifactSha256.slice(0, 16)}…</code>
                      ) : (
                        (job.blockedReason ?? '-')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มี Export</h2>
            <p>สร้าง Review CSV หลังมีรายการจ่ายหรือ OT ที่พร้อมส่งออก</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
