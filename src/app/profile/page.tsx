import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { HomeAddressForm } from '@/components/profile/HomeAddressForm';
import { requireActor } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { profileSettings } from '@/server/profile-settings';

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
  const settings = await profileSettings(actor);

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
        <div className="section-header">
          <div>
            <h2>ที่อยู่สำหรับ Mileage</h2>
            <p>ตั้งค่า Home Address ของคุณเพื่อให้ฟอร์มเบิกค่ารถเติมที่อยู่ “บ้าน” ให้อัตโนมัติ</p>
          </div>
        </div>
        <HomeAddressForm csrf={antiForgery} initialHomeAddress={settings.homeAddress} />
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
