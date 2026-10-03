import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { createGoogleRoutePreview } from '@/server/integrations/google-routes';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    mutationHeaders(request);
    const preview = await createGoogleRoutePreview(actor, await request.json());
    return Response.json(
      { ok: true, preview },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
