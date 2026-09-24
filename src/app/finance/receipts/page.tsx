import Link from 'next/link';
import { AppShell, Money, StateLabel } from '@/components/AppShell';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { financeOriginalReceipts } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function FinanceReceiptsPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance');
  const rows = await financeOriginalReceipts();

  return (
    <AppShell
      actor={actor}
      title="ใบเสร็จต้นฉบับ"
      description="รายการสามารถจ่ายด้วย Digital Receipt ได้ก่อน แต่ต้นฉบับยังคงเป็นสถานะแยกจน Finance รับจริง"
    >
      <section className="section">
        {rows.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>พนักงาน</th>
                  <th>เรื่อง</th>
                  <th>การจ่าย</th>
                  <th>ต้นฉบับ</th>
                  <th className="amount">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.requestId}>
                    <td>
                      <Link className="text-link" href={`/requests/${row.requestId}`}>
                        {row.reference}
                      </Link>
                    </td>
                    <td>{row.employeeName}</td>
                    <td>{row.title}</td>
                    <td>
                      <StateLabel value={row.paymentState} />
                    </td>
                    <td>
                      <StateLabel value={row.state} />
                    </td>
                    <td className="amount">
                      <Money satang={row.amountSatang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ไม่มีต้นฉบับค้างรับ</h2>
            <p>รายการที่นโยบายบังคับต้นฉบับจะปรากฏที่นี่จนกว่าจะบันทึกรับจริง</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
