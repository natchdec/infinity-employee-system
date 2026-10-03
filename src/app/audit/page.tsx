import { AppShell } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';
import { auditTimeline } from '@/server/audit-queries';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const actor = await requireActor();
  const rows = await auditTimeline(actor);

  return (
    <AppShell
      actor={actor}
      title="Audit Timeline"
      description="ประวัติการทำรายการที่ตรวจสอบย้อนหลังได้"
    >
      <section className="section">
        {rows.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ผู้ดำเนินการ</th>
                  <th>เหตุการณ์</th>
                  <th>รายการ</th>
                  <th>สรุป</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.occurredAt.toLocaleString('th-TH', {
                        timeZone: 'Asia/Bangkok',
                      })}
                    </td>
                    <td>{row.actorName}</td>
                    <td>{row.action}</td>
                    <td>{row.entityType}</td>
                    <td>{row.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มีประวัติที่แสดงได้</h2>
          </div>
        )}
      </section>
    </AppShell>
  );
}
