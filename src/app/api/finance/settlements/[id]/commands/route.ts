import { invariant } from '@/domain/core';
import { apiActor, apiError, mutationHeaders } from '@/server/api';
import { confirmSettlementRefund, verifySettlement } from '@/server/settlement';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const actor = await apiActor(request);
    const { idempotencyKey } = mutationHeaders(request);
    const { id } = await params;
    invariant(
      /^[0-9a-f-]{36}$/i.test(id),
      'SETTLEMENT_NOT_FOUND',
      'ไม่พบรายการเคลียร์ค่าใช้จ่าย',
      404,
    );
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === 'verify') {
      const result = await verifySettlement(
        actor,
        id,
        { expectedRevision: body.expectedRevision },
        idempotencyKey,
      );
      return Response.json(
        { ok: true, settlement: result },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (body.action === 'refund_received') {
      const result = await confirmSettlementRefund(
        actor,
        id,
        {
          expectedRevision: body.expectedRevision,
          externalReference: body.externalReference,
        },
        idempotencyKey,
      );
      return Response.json(
        { ok: true, settlement: result },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    invariant(false, 'UNKNOWN_COMMAND', 'ไม่รู้จักคำสั่งนี้', 400);
  } catch (error) {
    return apiError(error);
  }
}
