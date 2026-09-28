import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { enqueueManualOutlookCalendarSync } from '@/server/worklog';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const result = await enqueueManualOutlookCalendarSync(actor, idempotencyKey);
    return Response.json(
      { ok: true, sync: result },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
