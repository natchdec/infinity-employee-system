import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import {
  MonthlyCloseControls,
  type MonthlyPeriodControlRow,
} from '@/components/MonthlyCloseControls';
import { bangkokDate } from '@/domain/calendar';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { monthlyOperationalPeriods } from '@/server/operations-queries';

export const dynamic = 'force-dynamic';

function monthOffset(month: string, offset: number): string {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, value! - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export default async function MonthlyClosePage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance', 'admin');

  const existing = await monthlyOperationalPeriods(48);
  const currentMonth = bangkokDate(new Date()).slice(0, 7);
  const months = [monthOffset(currentMonth, -1), currentMonth, monthOffset(currentMonth, 1)];
  for (const row of existing) {
    if (!months.includes(row.month)) months.push(row.month);
  }
  months.sort((a, b) => b.localeCompare(a));

  const existingByKey = new Map(
    existing.map((row) => [`${row.month}:${row.family}`, row] as const),
  );
  const rows: MonthlyPeriodControlRow[] = months.flatMap((month) =>
    (['payroll', 'claims'] as const).map((family) => {
      const found = existingByKey.get(`${month}:${family}`);
      return {
        month,
        family,
        state: found?.state ?? 'open',
        revision: found?.revision ?? 0,
      };
    }),
  );

  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';

  return (
    <AppShell
      actor={actor}
      title="Monthly Closing"
      description="ควบคุมรอบ Payroll และ Claims แบบ Open → Closing → Locked โดยไม่แก้ประวัติย้อนหลัง"
    >
      <section className="section">
        <div className="notice">
          <p>
            เริ่มปิดรอบเพื่อหยุดรับรายการย้อนหลังของเดือนนั้น และ Lock เมื่อรายการค้างเป็นศูนย์ หลัง
            Lock ให้ใช้ Adjustment แทนการแก้คำขอเดิม
          </p>
        </div>
      </section>
      <MonthlyCloseControls csrf={csrf} rows={rows} />
    </AppShell>
  );
}
