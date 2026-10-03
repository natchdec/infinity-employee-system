import { AppShell } from '@/components/AppShell';
import { AdminSectionNav, ApprovalRulesPanel } from '@/components/AdminConfiguration';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { adminApprovalPolicy } from '@/server/admin-config';

export const dynamic = 'force-dynamic';

export default async function AdminApprovalRulesPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'admin');
  const policy = await adminApprovalPolicy();

  return (
    <AppShell
      actor={actor}
      title="Approval Rules"
      description="กฎอนุมัติที่ระบบใช้จริงและประวัติ Published Policy"
    >
      <AdminSectionNav />
      <ApprovalRulesPanel current={policy.current} history={policy.history} rows={policy.rows} />
    </AppShell>
  );
}
