import { invariant } from '@/domain/core';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { markPaymentBatchPaid, voidPaymentBatch } from '@/server/payment';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const { id } = await params;
    invariant(/^[0-9a-f-]{36}$/i.test(id), 'PAYMENT_BATCH_NOT_FOUND', 'ไม่พบชุดจ่าย', 404);
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === 'pay') {
      const result = await markPaymentBatchPaid(
        actor,
        id,
        {
          expectedRevision: body.expectedRevision,
          paidDate: body.paidDate,
          externalReference: body.externalReference,
        },
        idempotencyKey,
      );
      return Response.json(
        { ok: true, paymentBatch: result },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (body.action === 'void') {
      invariant(
        Number.isSafeInteger(body.expectedRevision),
        'REVISION_REQUIRED',
        'ต้องระบุ revision ล่าสุด',
        400,
      );
      const result = await voidPaymentBatch(
        actor,
        id,
        Number(body.expectedRevision),
        idempotencyKey,
      );
      return Response.json(
        { ok: true, paymentBatch: result },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    invariant(false, 'UNKNOWN_COMMAND', 'ไม่รู้จักคำสั่งนี้', 400);
  } catch (error) {
    return apiError(error);
  }
}
