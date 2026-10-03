import { cookies } from 'next/headers';
import { AppShell, Money } from '@/components/AppShell';
import { PayrollExportControls } from '@/components/FinanceControls';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { financePayroll } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function FinancePayrollPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance');
  const cycles = await financePayroll();
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';

  return (
    <AppShell
      actor={actor}
      title="OT / Payroll"
      description="OT ที่อนุมัติแล้วถูกจัดเข้ารอบจาก centralized Bangkok cutoff; late approval จะไป cycle ถัดไป"
    >
      <section className="section">
        <PayrollExportControls
          csrf={csrf}
          months={cycles.filter((cycle) => cycle.itemCount > 0).map((cycle) => cycle.month)}
        />
      </section>
      <section className="section">
        {cycles.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>รอบ</th>
                  <th>Payday</th>
                  <th>Cutoff</th>
                  <th>สถานะ</th>
                  <th>OT Items</th>
                  <th className="amount">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle) => (
                  <tr key={cycle.month}>
                    <td>{cycle.month}</td>
                    <td>{cycle.payday}</td>
                    <td>{cycle.cutoffAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</td>
                    <td>
                      <span className="state state-neutral">{cycle.state}</span>
                    </td>
                    <td>{cycle.itemCount}</td>
                    <td className="amount">
                      <Money satang={cycle.totalSatang} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มี Payroll Cycle</h2>
            <p>cycle จะถูกสร้างเมื่อ OT ที่อนุมัติถูกจัดรอบเป็นครั้งแรก</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
