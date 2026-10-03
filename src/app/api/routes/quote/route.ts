import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { createGoogleRouteQuote } from '@/server/integrations/google-routes';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    mutationHeaders(request);
    const quote = await createGoogleRouteQuote(actor, await request.json(), new Date());
    return Response.json(
      { ok: true, quote },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
