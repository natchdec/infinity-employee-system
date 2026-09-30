import { apiActor, apiError, mutationHeaders } from '@/server/api';
import {
  enqueueManualOutlookCalendarSync,
  manualOutlookCalendarSyncStatus,
} from '@/server/worklog';

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

export async function GET(request: Request) {
  try {
    const actor = await apiActor(request);
    const jobId = new URL(request.url).searchParams.get('jobId') ?? '';
    const status = await manualOutlookCalendarSyncStatus(actor, jobId);
    return Response.json({ ok: true, sync: status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
