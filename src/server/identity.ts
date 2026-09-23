import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config';
import { db } from './db';
import { invariant, type Actor, type Role } from '../domain/core';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const roles = new Set<Role>(['employee', 'head', 'finance', 'admin']);

export function digestOpaque(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function cookieNames(): { session: string; csrf: string; flow: string } {
  const production = config().APP_ENV === 'production';
  return {
    session: production ? '__Host-infinity_session' : 'infinity_session',
    csrf: production ? '__Host-infinity_csrf' : 'infinity_csrf',
    flow: 'infinity_flow',
  };
}

export function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const item = part.trim();
    if (!item.startsWith(`${name}=`)) continue;
    const raw = item.slice(name.length + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export async function issueSession(
  employeeId: string,
): Promise<{ sessionValue: string; antiForgeryValue: string; expiresAt: Date }> {
  invariant(
    /^[0-9a-f-]{36}$/i.test(employeeId),
    'INVALID_EMPLOYEE',
    'ข้อมูลพนักงานไม่ถูกต้อง',
    400,
  );
  const sessionValue = randomBytes(32).toString('base64url');
  const antiForgeryValue = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db().begin(async (tx) => {
    await tx`delete from sessions where expires_at < now() or revoked_at is not null`;
    await tx`
      insert into sessions(token_hash, employee_id, csrf_hash, expires_at)
      values(${digestOpaque(sessionValue)}, ${employeeId}, ${digestOpaque(antiForgeryValue)}, ${expiresAt})
    `;
  });

  return { sessionValue, antiForgeryValue, expiresAt };
}

export async function actorForSessionValue(
  value: string | null | undefined,
): Promise<Actor | null> {
  if (!value) return null;
  const [row] = await db()`
    select
      e.id,
      e.display_name,
      e.email,
      e.is_head_owner,
      e.active,
      coalesce(array_agg(er.role) filter (where er.role is not null), array[]::text[]) as roles
    from sessions s
    join employees e on e.id = s.employee_id
    left join employee_roles er on er.employee_id = e.id
    where s.token_hash = ${digestOpaque(value)}
      and s.expires_at > now()
      and s.revoked_at is null
      and e.active
    group by e.id
  `;
  if (!row) return null;
  const mappedRoles = (row.roles as string[]).filter((value): value is Role =>
    roles.has(value as Role),
  );
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    roles: mappedRoles,
    isHeadOwner: row.is_head_owner,
    active: row.active,
  };
}

export function verifyAntiForgery(request: Request, supplied: string | null): void {
  const browserValue = cookieValue(request, cookieNames().csrf);
  invariant(
    browserValue && supplied,
    'ANTI_FORGERY_REQUIRED',
    'คำขอหมดอายุ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง',
    403,
  );
  const left = Buffer.from(digestOpaque(browserValue));
  const right = Buffer.from(digestOpaque(supplied));
  invariant(
    left.length === right.length && timingSafeEqual(left, right),
    'ANTI_FORGERY_INVALID',
    'คำขอไม่ผ่านการตรวจสอบความปลอดภัย',
    403,
  );
}

export async function revokeSessionValue(value: string | null): Promise<void> {
  if (!value) return;
  await db()`
    update sessions
    set revoked_at = coalesce(revoked_at, now())
    where token_hash = ${digestOpaque(value)}
  `;
}
