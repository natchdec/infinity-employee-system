import { randomUUID } from 'node:crypto';
import { invariant } from '@/domain/core';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { reviewWorklogItem } from '@/server/worklog-review-service';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const { id } = await params;
    invariant(/^[0-9a-f-]{36}$/i.test(id), 'NOT_FOUND', 'ไม่พบ Calendar Draft', 404);
    const input = await request.json();
    const result = await reviewWorklogItem(
      actor,
      id,
      input,
      idempotencyKey,
      new Date(),
      request.headers.get('x-correlation-id') ?? randomUUID(),
    );
    return Response.json(
      { ok: true, worklog: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
