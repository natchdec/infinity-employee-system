import Link from 'next/link';
import { AppShell, Money, StateLabel } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';
import { employeeTrips } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function TripsPage() {
  const actor = await requireActor();
  const trips = await employeeTrips(actor.id);

  return (
    <AppShell
      actor={actor}
      title="การเดินทาง"
      description="ติดตามทริป เบี้ยเลี้ยง เงินทดรอง และสถานะการเคลียร์ค่าใช้จ่าย"
    >
      <section className="section">
        <div className="section-header">
          <div>
            <h2>ทริปของฉัน</h2>
            <p>เงินทดรองและค่าใช้จ่ายต้องอ้างอิงทริปที่ได้รับอนุมัติ</p>
          </div>
          <div className="action-row">
            <Link className="button button-primary" href="/requests/new?kind=trip">
              สร้างทริป
            </Link>
            <Link className="button button-secondary" href="/requests/new?kind=advance">
              ขอเงินทดรอง
            </Link>
          </div>
        </div>
        {trips.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">ทริปของฉัน</caption>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>เรื่อง</th>
                  <th>วันที่เริ่ม</th>
                  <th>สถานะ</th>
                  <th className="amount">ประมาณการ</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="text-link" href={`/requests/${item.id}`}>
                        {item.reference}
                      </Link>
                    </td>
                    <td>{item.title}</td>
                    <td>{item.businessDate}</td>
                    <td>
                      <StateLabel value={item.workflowState} />
                    </td>
                    <td className="amount">
                      <Money satang={item.totalSatang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มีทริป</h2>
            <p>ทริปที่ส่งคำขอแล้วจะปรากฏที่นี่</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
