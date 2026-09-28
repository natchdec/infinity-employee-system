import { randomUUID } from 'node:crypto';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { changeApprovalDelegation } from '@/server/approval-delegation-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const input = await request.json();
    const result = await changeApprovalDelegation(
      actor,
      input,
      idempotencyKey,
      new Date(),
      request.headers.get('x-correlation-id') ?? randomUUID(),
    );
    return Response.json(
      { ok: true, delegation: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
