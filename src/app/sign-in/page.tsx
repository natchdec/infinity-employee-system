import { redirect } from 'next/navigation';
import { BrandLogo } from '@/components/BrandLogo';
import { currentActor } from '@/server/auth-context';
import { config } from '@/server/config';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  if (await currentActor()) redirect('/');

  const params = await searchParams;
  const c = config();
  if (c.AUTH_MODE === 'cloudflare_access' && !params.reason) {
    redirect('/auth/access');
  }

  const cloudflare = c.AUTH_MODE === 'cloudflare_access';
  return (
    <main className="signin-shell">
      <section className="signin-panel" aria-labelledby="signin-title">
        <div className="signin-logo">
          <BrandLogo />
        </div>
        <p className="signin-product">Employee System</p>
        <h1 id="signin-title">เข้าสู่ระบบพนักงาน</h1>
        <p>
          {params.reason
            ? 'การยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อผู้ดูแลระบบ'
            : 'ใช้บัญชี Microsoft 365 ของบริษัท ระบบนี้ไม่มีรหัสผ่านพนักงานแยกต่างหาก'}
        </p>
        <a className="button button-primary" href={cloudflare ? '/auth/access' : '/auth/start'}>
          {cloudflare ? 'เข้าสู่ระบบผ่าน Microsoft 365' : 'เข้าสู่ระบบด้วย Microsoft'}
        </a>
      </section>
    </main>
  );
}
