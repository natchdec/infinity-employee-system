import { randomUUID } from 'node:crypto';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { reviewMicrosoftDirectoryAccount } from '@/server/directory-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const { id } = await context.params;
    const result = await reviewMicrosoftDirectoryAccount(
      actor,
      id,
      await request.json(),
      idempotencyKey,
      new Date(),
      request.headers.get('x-correlation-id') ?? randomUUID(),
    );
    return Response.json(
      { ok: true, account: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
