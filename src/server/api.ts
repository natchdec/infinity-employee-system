import { ZodError } from 'zod';
import { DomainError, invariant, type Actor } from '../domain/core';
import { actorForSessionValue, cookieNames, cookieValue, verifyAntiForgery } from './identity';

export async function apiActor(request: Request): Promise<Actor> {
  const actor = await actorForSessionValue(cookieValue(request, cookieNames().session));
  invariant(actor, 'AUTHENTICATION_REQUIRED', 'กรุณาเข้าสู่ระบบใหม่', 401);
  return actor;
}

export function mutationHeaders(request: Request): { idempotencyKey: string } {
  const size = Number(request.headers.get('content-length') ?? '0');
  invariant(
    !Number.isFinite(size) || size <= 262_144,
    'REQUEST_TOO_LARGE',
    'ข้อมูลคำขอมีขนาดใหญ่เกินไป',
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
  return { idempotencyKey };
}

export function apiError(error: unknown): Response {
  if (error instanceof DomainError) {
    return Response.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          fields: error.fields,
        },
      },
      {
        status: error.status,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      fields[issue.path.join('.') || 'input'] = issue.message;
    }
    return Response.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'ตรวจสอบข้อมูลคำขออีกครั้ง',
          fields,
        },
      },
      {
        status: 422,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      level: 'error',
      event: 'api_unhandled_error',
      message: error instanceof Error ? error.message : 'unknown',
    }),
  );
  return Response.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'ระบบไม่สามารถดำเนินการได้ในขณะนี้',
      },
    },
    {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
