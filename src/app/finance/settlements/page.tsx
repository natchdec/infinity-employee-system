import Link from 'next/link';
import { AppShell, Money } from '@/components/AppShell';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { financeSettlements } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function FinanceSettlementsPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance');
  const rows = await financeSettlements();

  return (
    <AppShell
      actor={actor}
      title="Settlement"
      description="เคลียร์ค่าใช้จ่ายจริงกับเงินทดรอง โดยไม่จ่าย Trip expense ซ้ำเป็น payable แยก"
    >
      <section className="section">
        {rows.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>พนักงาน</th>
                  <th>สถานะ</th>
                  <th>กำหนด</th>
                  <th className="amount">Actual</th>
                  <th className="amount">Advance</th>
                  <th className="amount">Net</th>
                  <th>ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link className="text-link" href={`/requests/${row.tripId}`}>
                        {row.tripReference}
                      </Link>
                      <div className="cell-secondary">{row.tripTitle}</div>
                    </td>
                    <td>{row.employeeName}</td>
                    <td>
                      <span
                        className={`state ${row.state === 'settled' ? 'state-success' : row.state === 'refund_due' ? 'state-warning' : 'state-neutral'}`}
                      >
                        {row.state}
                      </span>
                    </td>
                    <td>{row.dueDate}</td>
                    <td className="amount">
                      <Money satang={row.actualSatang} />
                    </td>
                    <td className="amount">
                      <Money satang={row.paidAdvanceSatang} />
                    </td>
                    <td className="amount">
                      <Money satang={row.netSatang} />
                    </td>
                    <td>
                      {row.ownerId === actor.id ? (
                        <span className="state state-warning">ห้ามตรวจของตนเอง</span>
                      ) : (
                        <Link className="text-link" href={`/requests/${row.tripId}`}>
                          เปิดรายละเอียด
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มี Settlement</h2>
            <p>Employee เริ่มเคลียร์ได้หลังวันสิ้นสุด Trip ที่ได้รับอนุมัติ</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
