import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { NotificationList } from '@/components/NotificationList';
import { requireActor } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { employeeNotifications } from '@/server/operations-queries';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const actor = await requireActor();
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const rows = await employeeNotifications(actor.id);
  const unread = rows.filter((row) => !row.readAt).length;

  return (
    <AppShell
      actor={actor}
      title="การแจ้งเตือน"
      description="รวมงานที่ต้องกลับมาตรวจสอบ อนุมัติ หรือส่งเอกสาร"
    >
      <section className="section">
        <div className="compact-summary-line">
          <strong>{unread} ยังไม่ได้อ่าน</strong>
          <span>·</span>
          <span>{rows.length} รายการล่าสุด</span>
        </div>
      </section>
      <section className="section">
        <NotificationList
          csrf={csrf}
          rows={rows.map((row) => ({
            id: row.id,
            title: row.title,
            href: row.href,
            createdAt: row.createdAt.toISOString(),
            readAt: row.readAt?.toISOString() ?? null,
          }))}
        />
      </section>
    </AppShell>
  );
}
