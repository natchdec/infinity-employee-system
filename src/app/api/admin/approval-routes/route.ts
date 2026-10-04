import { randomUUID } from 'node:crypto';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { setAdminApprovalRoute } from '@/server/admin-config';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const result = await setAdminApprovalRoute(
      actor,
      await request.json(),
      idempotencyKey,
      new Date(),
      request.headers.get('x-correlation-id') ?? randomUUID(),
    );
    return Response.json(
      { ok: true, approvalRoute: result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
