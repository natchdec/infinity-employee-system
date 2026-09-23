import { redirect } from 'next/navigation';
import { currentActor } from '@/server/auth-context';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  if (await currentActor()) redirect('/');

  return (
    <main className="signin-shell">
      <section className="signin-panel" aria-labelledby="signin-title">
        <p className="signin-brand">INFINITY SOLUTION SERVICE</p>
        <h1 id="signin-title">เข้าสู่ระบบพนักงาน</h1>
        <p>ใช้บัญชี Microsoft 365 ของบริษัท ระบบนี้ไม่มีรหัสผ่านพนักงานแยกต่างหาก</p>
        <a className="button button-primary" href="/auth/start">
          เข้าสู่ระบบด้วย Microsoft
        </a>
      </section>
    </main>
  );
}
