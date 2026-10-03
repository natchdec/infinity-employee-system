import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppShell, Money, StateLabel } from '@/components/AppShell';
import { ApprovalDelegationPanel } from '@/components/ApprovalDelegationPanel';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { approvalDelegationOptions } from '@/server/approval-delegation-service';
import { cookieNames } from '@/server/identity';
import { assignedApprovals } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'head');
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const [requests, delegation] = await Promise.all([
    assignedApprovals(actor.id),
    approvalDelegationOptions(actor),
  ]);

  return (
    <AppShell
      actor={actor}
      title="รออนุมัติ"
      description="เฉพาะคำขอที่ถูกมอบหมายให้คุณในรอบอนุมัติปัจจุบัน"
    >
      <section className="section">
        {requests.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">คำขอที่รอการอนุมัติ</caption>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>พนักงาน</th>
                  <th>เรื่อง</th>
                  <th>วันที่</th>
                  <th>สถานะ</th>
                  <th className="amount">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="text-link" href={`/requests/${item.id}`}>
                        {item.reference}
                      </Link>
                    </td>
                    <td>{item.employeeName}</td>
                    <td>{item.title}</td>
                    <td>{item.businessDate}</td>
                    <td>
                      <StateLabel value={item.workflowState} />
                    </td>
                    <td className="amount">
                      {BigInt(item.totalSatang) > 0n ? <Money satang={item.totalSatang} /> : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ไม่มีรายการรออนุมัติ</h2>
            <p>
              รายการของ Owner / Head เองจะข้ามขั้นหัวหน้าด้วยเหตุการณ์ระบบ ไม่ใช่การอนุมัติตนเอง
            </p>
          </div>
        )}
      </section>
      <ApprovalDelegationPanel
        csrf={csrf}
        delegations={delegation.delegations}
        candidates={delegation.candidates}
      />
    </AppShell>
  );
}
