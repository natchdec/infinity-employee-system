import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { AdminSectionNav, ApprovalRulesPanel } from '@/components/AdminConfiguration';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { adminApprovalPolicy } from '@/server/admin-config';
import { cookieNames } from '@/server/identity';

export const dynamic = 'force-dynamic';

export default async function AdminApprovalRulesPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'admin');
  const [policy, store] = await Promise.all([adminApprovalPolicy(), cookies()]);
  const csrf = store.get(cookieNames().csrf)?.value ?? '';

  return (
    <AppShell
      actor={actor}
      title="Approval Rules"
      description="กฎอนุมัติที่ระบบใช้จริงและประวัติ Published Policy"
    >
      <AdminSectionNav />
      <ApprovalRulesPanel
        csrf={csrf}
        current={policy.current}
        history={policy.history}
        rows={policy.rows}
        routes={policy.routes}
        approvers={policy.approvers}
      />
    </AppShell>
  );
}
