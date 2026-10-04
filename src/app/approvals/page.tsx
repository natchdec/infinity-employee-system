import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppShell, Money, StateLabel } from '@/components/AppShell';
import { ApprovalDelegationPanel } from '@/components/ApprovalDelegationPanel';
import { requireActor } from '@/server/auth-context';
import { approvalDelegationOptions } from '@/server/approval-delegation-service';
import { cookieNames } from '@/server/identity';
import { assignedApprovals } from '@/server/queries';

export const dynamic = 'force-dynamic';

const kindLabel = {
  leave: 'ลา',
  ot: 'OT',
  expense: 'ค่าใช้จ่าย',
  trip: 'เดินทาง',
  advance: 'เงินทดรอง',
} as const;

export default async function ApprovalsPage() {
  const actor = await requireActor();
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const [requests, delegation] = await Promise.all([
    assignedApprovals(actor.id),
    approvalDelegationOptions(actor),
  ]);
  const counts = requests.reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell
      actor={actor}
      title="รายการรออนุมัติ"
      description="คำขอที่ถูกมอบหมายให้คุณในรอบอนุมัติปัจจุบัน"
    >
      <section className="section approval-workspace">
        <aside className="approval-filter" aria-label="สรุปประเภทคำขอ">
          <div className="approval-filter-title">
            ทั้งหมด <strong>{requests.length}</strong>
          </div>
          {Object.entries(kindLabel).map(([kind, label]) => (
            <div className="approval-filter-row" key={kind}>
              <span>{label}</span>
              <strong>{counts[kind] ?? 0}</strong>
            </div>
          ))}
        </aside>

        <div className="approval-main">
          <div className="approval-toolbar">
            <strong>รายการรออนุมัติ</strong>
            <span>{requests.length} รายการ</span>
          </div>
          {requests.length ? (
            <div className="data-table-wrap" tabIndex={0}>
              <table className="data-table">
                <caption className="sr-only">คำขอที่รอการอนุมัติ</caption>
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>ประเภท</th>
                    <th>เลขที่</th>
                    <th>พนักงาน</th>
                    <th>เรื่อง</th>
                    <th className="amount">ยอด</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((item) => (
                    <tr key={item.id}>
                      <td>{item.businessDate}</td>
                      <td>{kindLabel[item.kind]}</td>
                      <td>
                        <Link className="text-link" href={`/requests/${item.id}`}>
                          {item.reference}
                        </Link>
                      </td>
                      <td>{item.employeeName}</td>
                      <td>{item.title}</td>
                      <td className="amount">
                        {BigInt(item.totalSatang) > 0n ? <Money satang={item.totalSatang} /> : '-'}
                      </td>
                      <td>
                        <StateLabel value={item.workflowState} />
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
        </div>
      </section>

      <ApprovalDelegationPanel
        csrf={csrf}
        delegations={delegation.delegations}
        candidates={delegation.candidates}
      />
    </AppShell>
  );
}
