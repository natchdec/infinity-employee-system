import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';

export const dynamic = 'force-dynamic';

const roleLabel = {
  employee: 'Employee',
  head: 'Head',
  finance: 'Finance',
  admin: 'Admin',
} as const;

export default async function ProfilePage() {
  const actor = await requireActor();
  const store = await cookies();
  const antiForgery = store.get(cookieNames().csrf)?.value ?? '';

  return (
    <AppShell
      actor={actor}
      title="โปรไฟล์"
      description="ข้อมูลตัวตนมาจาก Microsoft Entra และการแมปพนักงานที่ผู้ดูแลกำหนด"
    >
      <section className="section">
        <dl className="profile-grid">
          <dt>ชื่อ</dt>
          <dd>{actor.displayName}</dd>
          <dt>อีเมล</dt>
          <dd>{actor.email}</dd>
          <dt>บทบาท</dt>
          <dd>{actor.roles.map((role) => roleLabel[role]).join(', ')}</dd>
          <dt>Owner / Head</dt>
          <dd>{actor.isHeadOwner ? 'ใช่' : 'ไม่ใช่'}</dd>
        </dl>
      </section>
      <section className="section">
        <form action="/auth/sign-out" method="post">
          <input name="_csrf" type="hidden" value={antiForgery} />
          <button className="button button-secondary" type="submit">
            ออกจากระบบ
          </button>
        </form>
      </section>
    </AppShell>
  );
}
