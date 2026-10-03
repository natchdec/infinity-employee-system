import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';
import { employeeExceptionInbox } from '@/server/operations-queries';

export const dynamic = 'force-dynamic';

export default async function ExceptionsPage() {
  const actor = await requireActor();
  const rows = await employeeExceptionInbox(actor.id);
  const blocking = rows.filter((row) => row.severity === 'blocking').length;

  return (
    <AppShell
      actor={actor}
      title="Needs Attention"
      description="รวมรายการที่ต้องแก้หรือตรวจสอบก่อน workflow จะเดินต่อ"
    >
      <section className="section">
        <div className="metric-row">
          <div className="metric">
            <strong>{rows.length}</strong>
            <span>ต้องตรวจสอบ</span>
          </div>
          <div className="metric">
            <strong>{blocking}</strong>
            <span>Blocking</span>
          </div>
        </div>
      </section>
      <section className="section">
        {rows.length ? (
          <div className="quick-list">
            {rows.map((row) => (
              <Link className="quick-link" href={row.href} key={row.id}>
                <strong>{row.title}</strong>
                <span>{row.detail}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h2>ไม่มีรายการที่ต้องแก้</h2>
            <p>Calendar, receipt และ configuration ที่พร้อมใช้งานจะไม่แสดงในหน้านี้</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
