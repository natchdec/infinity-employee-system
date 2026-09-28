import { invariant } from '@/domain/core';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { markNotificationRead } from '@/server/notification-service';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await apiActor(request);
    mutationHeaders(request);
    const { id } = await params;
    invariant(/^[0-9a-f-]{36}$/i.test(id), 'NOT_FOUND', 'ไม่พบการแจ้งเตือน', 404);
    await markNotificationRead(actor, id);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
