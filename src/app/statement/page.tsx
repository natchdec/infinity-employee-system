import { AppShell } from '@/components/AppShell';
import { bangkokDate } from '@/domain/calendar';
import { requireActor } from '@/server/auth-context';
import { employeeMonthlyStatement } from '@/server/monthly-statement';

export const dynamic = 'force-dynamic';

const paymentLabel = {
  none: 'ไม่มีรายการจ่าย',
  pending: 'อยู่ระหว่างดำเนินการ',
  partial: 'จ่ายบางรายการแล้ว',
  paid: 'จ่ายครบแล้ว',
} as const;

function satangText(value: string): string {
  const satang = BigInt(value);
  return `${(satang / 100n).toLocaleString('en-US')}.${(satang % 100n)
    .toString()
    .padStart(2, '0')} บาท`;
}

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const currentMonth = bangkokDate(new Date()).slice(0, 7);
  const month = /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.month ?? '') ? params.month! : currentMonth;
  const statement = await employeeMonthlyStatement(actor.id, month);

  return (
    <AppShell
      actor={actor}
      title="สรุปรายเดือน"
      description="ภาพรวม OT ค่าเดินทาง ค่าใช้จ่าย เงินทดรอง Settlement และการลา"
    >
      <section className="section">
        <div className="metric-row">
          <div className="metric">
            <strong>{statement.otHours}</strong>
            <span>ชั่วโมง OT</span>
          </div>
          <div className="metric">
            <strong>{statement.mileageKm.toFixed(1)}</strong>
            <span>กม. ที่เข้าเกณฑ์</span>
          </div>
          <div className="metric">
            <strong>{statement.leaveDays}</strong>
            <span>วันลา</span>
          </div>
          <div className="metric">
            <strong>{paymentLabel[statement.paymentStatus]}</strong>
            <span>สถานะการจ่าย</span>
          </div>
        </div>
      </section>
      <section className="section">
        <dl className="detail-grid">
          <dt>OT</dt>
          <dd>{satangText(statement.otSatang)}</dd>
          <dt>ค่ารถส่วนตัว</dt>
          <dd>{satangText(statement.mileageSatang)}</dd>
          <dt>ค่าใช้จ่ายอื่น</dt>
          <dd>{satangText(statement.expenseSatang)}</dd>
          <dt>เงินทดรอง</dt>
          <dd>{satangText(statement.advanceSatang)}</dd>
          <dt>Settlement</dt>
          <dd>{satangText(statement.settlementSatang)}</dd>
        </dl>
      </section>
      <section className="section">
        <div className="notice">
          <p>
            เป็น Operational Statement ไม่ใช่สลิปเงินเดือน และรายการหลังปิดรอบต้องใช้ Adjustment
            แทนการแก้ประวัติย้อนหลัง
          </p>
        </div>
      </section>
    </AppShell>
  );
}
