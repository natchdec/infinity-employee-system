import { apiActor, apiError } from '@/server/api';
import { verifyAntiForgery } from '@/server/identity';
import { uploadDocument, type EvidenceClass } from '@/server/documents';
import { invariant } from '@/domain/core';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    const length = Number(request.headers.get('content-length') ?? '0');
    invariant(
      !Number.isFinite(length) || length <= 11 * 1024 * 1024,
      'REQUEST_TOO_LARGE',
      'ไฟล์มีขนาดใหญ่เกินไป',
      413,
    );
    verifyAntiForgery(request, request.headers.get('x-csrf-token'));
    const idempotencyKey = request.headers.get('idempotency-key') ?? '';
    invariant(
      /^[A-Za-z0-9_.:-]{8,160}$/.test(idempotencyKey),
      'IDEMPOTENCY_KEY_REQUIRED',
      'ต้องมีรหัสการทำรายการที่ถูกต้อง',
      400,
    );
    const form = await request.formData();
    const upload = form.get('file');
    const evidenceClass = form.get('evidenceClass');
    invariant(upload instanceof File, 'DOCUMENT_REQUIRED', 'เลือกไฟล์หลักฐาน');
    invariant(
      evidenceClass === 'expense' || evidenceClass === 'medical' || evidenceClass === 'settlement',
      'EVIDENCE_CLASS_REQUIRED',
      'ประเภทหลักฐานไม่ถูกต้อง',
    );
    const result = await uploadDocument(
      actor,
      { filename: upload.name || 'receipt', bytes: new Uint8Array(await upload.arrayBuffer()) },
      evidenceClass as EvidenceClass,
      idempotencyKey,
    );
    return Response.json(
      { ok: true, document: result },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
