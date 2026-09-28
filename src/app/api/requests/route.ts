import { randomUUID } from 'node:crypto';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { submitNewRequest } from '@/server/request-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const body = (await request.json()) as Record<string, unknown>;

    const legacySource =
      body.sourceWorklog &&
      typeof body.sourceWorklog === 'object' &&
      !Array.isArray(body.sourceWorklog)
        ? (body.sourceWorklog as { id?: unknown; expectedRevision?: unknown })
        : null;
    const sourceRows = Array.isArray(body.sourceWorklogs)
      ? body.sourceWorklogs
      : legacySource
        ? [legacySource]
        : [];
    const sourceWorklogs = sourceRows.map((value) => {
      const source =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as { id?: unknown; expectedRevision?: unknown })
          : {};
      return {
        id: String(source.id ?? ''),
        expectedRevision: Number(source.expectedRevision),
      };
    });

    const input = sourceWorklogs.length ? body.input : body;
    const result = await submitNewRequest(
      actor,
      input,
      idempotencyKey,
      new Date(),
      request.headers.get('x-correlation-id') ?? randomUUID(),
      sourceWorklogs.length ? sourceWorklogs : undefined,
    );
    return Response.json(
      { ok: true, request: result },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
