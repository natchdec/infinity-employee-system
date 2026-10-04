import {
  AirplaneTilt,
  CalendarCheck,
  ClockCountdown,
  Receipt,
} from '@phosphor-icons/react/dist/ssr';
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

export default async function HomePage() {
  const actor = await requireActor();
  const requests = await employeeRequests(actor.id, 8);
  const attention = requests.filter(
    (item) => item.workflowState === 'returned' || item.financeState === 'returned',
  );
  const activeCount = requests.filter(
    (item) => !['approved', 'rejected', 'cancelled'].includes(item.workflowState),
  ).length;
  const approvedCount = requests.filter((item) => item.workflowState === 'approved').length;
  const financePending = requests.filter((item) =>
    ['pending', 'verified', 'unpaid', 'allocated'].includes(item.financeState ?? ''),
  ).length;

  return (
    <AppShell
      actor={actor}
      title={`สวัสดี ${actor.displayName}`}
      description="ส่งคำขอ ติดตามสถานะ และดูงานที่ต้องดำเนินการจาก workspace เดียว"
    >
      <section className="overview-strip" aria-label="ภาพรวมคำขอของฉัน">
        <div className="overview-item">
          <span className="overview-label">กำลังดำเนินการ</span>
          <strong>{activeCount}</strong>
          <span>จากรายการล่าสุด</span>
        </div>
        <div className="overview-item overview-item-attention">
          <span className="overview-label">ต้องตรวจสอบ</span>
          <strong>{attention.length}</strong>
          <span>ส่งกลับในรายการล่าสุด</span>
        </div>
        <div className="overview-item">
          <span className="overview-label">รอการเงิน</span>
          <strong>{financePending}</strong>
          <span>อยู่ในรายการล่าสุด</span>
        </div>
        <div className="overview-item">
          <span className="overview-label">อนุมัติแล้ว</span>
          <strong>{approvedCount}</strong>
          <span>จากรายการล่าสุด</span>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <span className="section-kicker">QUICK ACTIONS</span>
            <h2>สร้างคำขอ</h2>
            <p>เลือกประเภทงาน ระบบจะแสดงเฉพาะข้อมูลและกฎที่เกี่ยวข้อง</p>
          </div>
          <Link className="button button-primary" href="/requests/new">
            สร้างคำขอ
          </Link>
        </div>
        <div className="quick-list">
          <Link className="quick-link" href="/requests/new?kind=leave">
            <span className="quick-link-icon" aria-hidden="true">
              <CalendarCheck size={22} weight="duotone" />
            </span>
            <strong>ลา</strong>
            <span>ลางานแบบเต็มวันและดูสิทธิคงเหลือ</span>
          </Link>
          <Link className="quick-link" href="/requests/new?kind=ot">
            <span className="quick-link-icon" aria-hidden="true">
              <ClockCountdown size={22} weight="duotone" />
            </span>
            <strong>OT</strong>
            <span>บันทึกชั่วโมงตามหมวดที่นโยบายกำหนด</span>
          </Link>
          <Link className="quick-link" href="/requests/new?kind=expense">
            <span className="quick-link-icon" aria-hidden="true">
              <Receipt size={22} weight="duotone" />
            </span>
            <strong>ค่าใช้จ่าย</strong>
            <span>แนบหลักฐาน ค่าเดินทาง และ Entertainment</span>
          </Link>
          <Link className="quick-link" href="/requests/new?kind=trip">
            <span className="quick-link-icon" aria-hidden="true">
              <AirplaneTilt size={22} weight="duotone" />
            </span>
            <strong>เดินทาง</strong>
            <span>ทริป เบี้ยเลี้ยง เงินทดรอง และการเคลียร์</span>
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <span className="section-kicker">ACTION REQUIRED</span>
            <h2>ต้องดำเนินการ</h2>
            <p>คำขอที่ถูกส่งกลับจะแสดงก่อนรายการทั่วไป</p>
          </div>
        </div>
        {attention.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">รายการที่ต้องดำเนินการ</caption>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ประเภท</th>
                  <th>เรื่อง</th>
                  <th>สถานะ</th>
                  <th className="amount">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {attention.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="text-link" href={`/requests/${item.id}`}>
                        {item.reference}
                      </Link>
                    </td>
                    <td>{kindLabel[item.kind]}</td>
                    <td>{item.title}</td>
                    <td>
                      <StateLabel
                        value={item.financeState === 'returned' ? 'returned' : item.workflowState}
                      />
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
          <div className="empty empty-calm">
            <span className="empty-eyebrow">ALL CLEAR</span>
            <h2>ไม่มีรายการที่ต้องแก้ไข</h2>
            <p>คำขอที่ถูกส่งกลับหรือมีข้อยกเว้นจะปรากฏที่นี่</p>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <span className="section-kicker">RECENT ACTIVITY</span>
            <h2>รายการล่าสุด</h2>
            <p>สถานะล่าสุดของคำขอที่คุณเป็นเจ้าของ</p>
          </div>
          <Link className="text-link text-link-arrow" href="/requests">
            ดูทั้งหมด
          </Link>
        </div>
        {requests.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">คำขอล่าสุด</caption>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ประเภท</th>
                  <th>เรื่อง</th>
                  <th>วันที่</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {requests.slice(0, 6).map((item) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มีคำขอ</h2>
            <p>เริ่มจากสร้างคำขอแรกของคุณ</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
