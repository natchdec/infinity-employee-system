import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { AdminSectionNav } from '@/components/AdminConfiguration';
import { OrganizationAdminClient } from './OrganizationAdminClient';
import { bangkokDate } from '@/domain/calendar';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { adminDepartments, adminEmployees } from '@/server/admin-config';
import { cookieNames } from '@/server/identity';

export const dynamic = 'force-dynamic';

export default async function AdminOrganizationPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'admin');
  const [employees, departments] = await Promise.all([adminEmployees(), adminDepartments()]);
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';

  return (
    <AppShell
      actor={actor}
      title="โครงสร้างองค์กร"
      description="จัดการ Department และ Employee → Line Head แบบ Effective-Dated พร้อมตรวจวงวนก่อนบันทึก"
    >
      <AdminSectionNav />
      <OrganizationAdminClient
        csrf={csrf}
        employees={employees}
        departments={departments}
        today={bangkokDate(new Date())}
      />
    </AppShell>
  );
}
