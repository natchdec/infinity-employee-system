import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { createPayrollExport } from '@/server/exports';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const result = await createPayrollExport(actor, await request.json(), idempotencyKey);
    return Response.json(
      { ok: true, export: result },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
