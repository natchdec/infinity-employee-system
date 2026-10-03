import { randomUUID } from 'node:crypto';
import { invariant } from '@/domain/core';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { financeAdjustmentDecision, headAdjustmentDecision } from '@/server/adjustment-service';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const { id } = await params;
    invariant(/^[0-9a-f-]{36}$/i.test(id), 'NOT_FOUND', 'ไม่พบ Adjustment', 404);
    const body = (await request.json()) as Record<string, unknown>;
    const input = { ...body, id };
    const correlationId = request.headers.get('x-correlation-id') ?? randomUUID();

    const result =
      body.action === 'head_approve' || body.action === 'head_void'
        ? await headAdjustmentDecision(actor, input, idempotencyKey, new Date(), correlationId)
        : await financeAdjustmentDecision(actor, input, idempotencyKey, new Date(), correlationId);

    return Response.json(
      { ok: true, adjustment: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
