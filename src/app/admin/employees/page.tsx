import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { AdminSectionNav } from '@/components/AdminConfiguration';
import { EmployeeAdminClient } from './EmployeeAdminClient';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { adminDepartments, adminEmployees } from '@/server/admin-config';
import { cookieNames } from '@/server/identity';

export const dynamic = 'force-dynamic';

export default async function AdminEmployeesPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'admin');
  const [employees, departments] = await Promise.all([adminEmployees(), adminDepartments()]);
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';

  return (
    <AppShell
      actor={actor}
      title="พนักงานและสิทธิ์"
      description="กำหนด Role, Head/Owner, Department และสถานะบัญชี โดยทุกการเปลี่ยนแปลงมี Audit"
    >
      <AdminSectionNav />
      <section className="section">
        <div className="notice">
          <p>
            Employee role เป็นฐานบังคับเสมอ Head/Owner จะมี Head role อัตโนมัติ และบัญชี Admin
            ที่กำลังใช้งานอยู่ไม่สามารถปิดตัวเองหรือถอด Admin role ของตัวเองได้
          </p>
        </div>
      </section>
      <section className="section">
        <EmployeeAdminClient
          csrf={csrf}
          actorId={actor.id}
          employees={employees}
          departments={departments}
        />
      </section>
    </AppShell>
  );
}
