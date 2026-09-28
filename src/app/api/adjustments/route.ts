import { randomUUID } from 'node:crypto';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { createAdjustment } from '@/server/adjustment-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const input = await request.json();
    const result = await createAdjustment(
      actor,
      input,
      idempotencyKey,
      new Date(),
      request.headers.get('x-correlation-id') ?? randomUUID(),
    );
    return Response.json(
      { ok: true, adjustment: result },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
