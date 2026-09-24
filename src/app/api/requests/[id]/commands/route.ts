import { randomUUID } from 'node:crypto';
import { invariant } from '@/domain/core';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import {
  cancelRequest,
  financeDecision,
  headDecision,
  resubmitRequest,
} from '@/server/request-service';
import { markOriginalReceiptReceived } from '@/server/finance-ops';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const { id } = await params;
    invariant(/^[0-9a-f-]{36}$/i.test(id), 'NOT_FOUND', 'ไม่พบรายการ', 404);
    const body = (await request.json()) as Record<string, unknown>;
    const correlationId = request.headers.get('x-correlation-id') ?? randomUUID();

    if (body.action === 'resubmit') {
      invariant(
        Number.isSafeInteger(body.expectedRevision),
        'REVISION_REQUIRED',
        'ต้องระบุ revision ล่าสุดของรายการ',
        400,
      );
      const result = await resubmitRequest(
        actor,
        id,
        Number(body.expectedRevision),
        body.input,
        idempotencyKey,
        new Date(),
        correlationId,
      );
      return Response.json(
        { ok: true, request: result },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (body.action === 'cancel') {
      const result = await cancelRequest(
        actor,
        id,
        body,
        idempotencyKey,
        new Date(),
        correlationId,
      );
      return Response.json(
        { ok: true, request: result },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (body.action === 'original_received') {
      const result = await markOriginalReceiptReceived(
        actor,
        id,
        {
          expectedRevision: body.expectedRevision,
          note: body.note,
        },
        idempotencyKey,
        new Date(),
        correlationId,
      );
      return Response.json(
        { ok: true, originalReceipt: result },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (body.action === 'approve' || body.action === 'return' || body.action === 'reject') {
      const result = await headDecision(actor, id, body, idempotencyKey, new Date(), correlationId);
      return Response.json(
        { ok: true, request: result },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (body.action === 'finance_verify' || body.action === 'finance_return') {
      const result = await financeDecision(
        actor,
        id,
        body,
        idempotencyKey,
        new Date(),
        correlationId,
      );
      return Response.json(
        { ok: true, request: result },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    invariant(false, 'UNKNOWN_COMMAND', 'ไม่รู้จักคำสั่งนี้', 400);
  } catch (error) {
    return apiError(error);
  }
}
