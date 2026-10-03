import { invariant } from '@/domain/core';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { submitSettlement } from '@/server/settlement';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const { id } = await params;
    invariant(/^[0-9a-f-]{36}$/i.test(id), 'NOT_FOUND', 'ไม่พบทริป', 404);
    const result = await submitSettlement(actor, id, idempotencyKey);
    return Response.json(
      { ok: true, settlement: result },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
