import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { PaymentBatchControls } from '@/components/FinanceControls';
import { requireActor, requirePageRole } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { financePayments } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function FinancePaymentsPage() {
  const actor = await requireActor();
  requirePageRole(actor, 'finance');
  const data = await financePayments();
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';

  return (
    <AppShell
      actor={actor}
      title="ชุดการจ่ายเงิน"
      description="รวมรายการที่ Finance ตรวจสอบแล้วเป็น Petty Cash หรือ Separate Transfer และบันทึกผลการจ่ายภายนอก"
    >
      <PaymentBatchControls
        csrf={csrf}
        actorId={actor.id}
        canPay={actor.roles.includes('finance_payer')}
        obligations={data.obligations}
        batches={data.batches.map((batch) => ({
          id: batch.id,
          reference: batch.reference,
          method: batch.method,
          status: batch.status,
          totalSatang: batch.totalSatang,
          revision: batch.revision,
          itemCount: batch.itemCount,
        }))}
      />
    </AppShell>
  );
}
