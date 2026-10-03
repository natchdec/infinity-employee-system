import { apiActor, apiError } from '@/server/api';
import { invariant } from '@/domain/core';
import { documentForActor } from '@/server/documents';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const actor = await apiActor(request);
    const { id } = await params;
    invariant(/^[0-9a-f-]{36}$/i.test(id), 'DOCUMENT_NOT_FOUND', 'ไม่พบเอกสาร', 404);
    const file = await documentForActor(actor, id);
    return new Response(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': file.mediaType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
