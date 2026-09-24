import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { RequestForm } from '@/components/request/RequestForm';
import { requireActor } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { kindLabel, requestDetail, requestFormOptions } from '@/server/request-view';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RequestEditPage({ params }: Props) {
  const actor = await requireActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let detail;
  try {
    detail = await requestDetail(actor, id);
  } catch {
    notFound();
  }

  if (
    detail.request.employee_id !== actor.id ||
    detail.request.workflow_state !== 'returned' ||
    ['allocated', 'paid'].includes(detail.request.payment_state)
  ) {
    notFound();
  }

  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const options = await requestFormOptions(actor);

  return (
    <AppShell
      actor={actor}
      title={`แก้ไข ${kindLabel(detail.request.kind)}`}
      description={`${detail.request.reference} · รอบเดิม ${detail.request.submission_round}`}
    >
      <div className="notice notice-warning">
        <p>การส่งใหม่จะสร้าง revision และรอบอนุมัติใหม่ ประวัติเดิมจะไม่ถูกเขียนทับ</p>
      </div>
      <RequestForm
        kind={detail.request.kind}
        csrf={csrf}
        options={options}
        mode="resubmit"
        requestId={detail.request.id}
        expectedRevision={detail.request.revision}
        initial={detail.payload}
      />
    </AppShell>
  );
}
