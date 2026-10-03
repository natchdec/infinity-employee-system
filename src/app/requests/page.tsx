import Link from 'next/link';
import { AppShell, Money, StateLabel } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';
import { employeeRequests } from '@/server/queries';

export const dynamic = 'force-dynamic';

const kindLabel = {
  leave: 'ลา',
  ot: 'OT',
  expense: 'ค่าใช้จ่าย',
  trip: 'เดินทาง',
  advance: 'เงินทดรอง',
} as const;

export default async function RequestsPage() {
  const actor = await requireActor();
  const requests = await employeeRequests(actor.id, 100);

  return (
    <AppShell
      actor={actor}
      title="รายการของฉัน"
      description="ติดตามคำขอของคุณโดยไม่รวมข้อมูลของพนักงานคนอื่น"
    >
      <section className="section">
        <div className="section-header">
          <div>
            <h2>คำขอทั้งหมด</h2>
            <p>{requests.length} รายการ</p>
          </div>
          <Link className="button button-primary" href="/requests/new">
            สร้างคำขอ
          </Link>
        </div>
        {requests.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">รายการคำขอของฉัน</caption>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ประเภท</th>
                  <th>เรื่อง</th>
                  <th>วันที่รายการ</th>
                  <th>อนุมัติ</th>
                  <th>การเงิน</th>
                  <th>การจ่าย</th>
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
                    <td>{kindLabel[item.kind]}</td>
                    <td>{item.title}</td>
                    <td>{item.businessDate}</td>
                    <td>
                      <StateLabel value={item.workflowState} />
                    </td>
                    <td>
                      {item.financeState === 'not_required' ? (
                        '-'
                      ) : (
                        <StateLabel value={item.financeState} />
                      )}
                    </td>
                    <td>
                      {item.paymentState === 'not_applicable' ? (
                        '-'
                      ) : (
                        <StateLabel value={item.paymentState} />
                      )}
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
            <h2>ยังไม่มีคำขอ</h2>
            <p>สร้างคำขอใหม่เพื่อเริ่มต้น</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
