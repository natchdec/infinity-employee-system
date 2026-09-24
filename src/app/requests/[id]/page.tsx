import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { RequestActions } from '@/components/RequestActions';
import { RequestSummary } from '@/components/request/RequestSummary';
import { bangkokDate } from '@/domain/calendar';
import { requireActor } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { kindLabel, requestDetail } from '@/server/request-view';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RequestDetailPage({ params }: Props) {
  const actor = await requireActor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let detail;
  try {
    detail = await requestDetail(actor, id);
  } catch {
    notFound();
  }

  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const end = typeof detail.payload.end === 'string' ? detail.payload.end : null;
  const settlementCanStart =
    detail.request.kind === 'trip' && end !== null && end <= bangkokDate(new Date());

  return (
    <AppShell
      actor={actor}
      title={`${kindLabel(detail.request.kind)} · ${detail.request.reference}`}
      description={detail.request.title}
    >
      <RequestSummary detail={detail} />
      <RequestActions
        csrf={csrf}
        actorId={actor.id}
        roles={actor.roles}
        request={{
          id: detail.request.id,
          employeeId: detail.request.employee_id,
          assignedHeadId: detail.request.assigned_head_id,
          kind: detail.request.kind,
          revision: detail.request.revision,
          workflowState: detail.request.workflow_state,
          financeState: detail.request.finance_state,
          paymentState: detail.request.payment_state,
        }}
        originalReceipt={
          detail.originalReceipt
            ? {
                state: detail.originalReceipt.state,
                revision: detail.originalReceipt.revision,
              }
            : null
        }
        settlement={
          detail.settlement
            ? {
                id: detail.settlement.id,
                state: detail.settlement.state,
                revision: detail.settlement.revision,
              }
            : null
        }
        settlementCanStart={settlementCanStart}
      />
    </AppShell>
  );
}
