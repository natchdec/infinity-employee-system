import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { enqueueManualProjectMasterSync } from '@/server/project-master-jobs';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const result = await enqueueManualProjectMasterSync(actor, idempotencyKey);
    return Response.json(
      { ok: true, sync: result },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
