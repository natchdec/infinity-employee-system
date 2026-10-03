import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { autocompletePlaces } from '@/server/integrations/google-places';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    await apiActor(request);
    mutationHeaders(request);
    const suggestions = await autocompletePlaces(await request.json());
    return Response.json({ ok: true, suggestions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
