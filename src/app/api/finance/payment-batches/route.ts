import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { createPaymentBatch } from '@/server/payment';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const input = await request.json();
    const result = await createPaymentBatch(actor, input, idempotencyKey);
    return Response.json(
      { ok: true, paymentBatch: result },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
