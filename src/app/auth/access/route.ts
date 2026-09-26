import { NextResponse } from 'next/server';
import { DomainError, invariant } from '@/domain/core';
import { verifyCloudflareAccessAssertion } from '@/server/cloudflare-access';
import { config } from '@/server/config';
import { db } from '@/server/db';
import { cookieNames, issueSession } from '@/server/identity';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const c = config();
    invariant(
      c.AUTH_MODE === 'cloudflare_access' &&
        c.CLOUDFLARE_ACCESS_TEAM_DOMAIN &&
        c.CLOUDFLARE_ACCESS_AUD,
      'ACCESS_NOT_CONFIGURED',
      'Cloudflare Access authentication is not configured',
      503,
    );
    const assertion = request.headers.get('cf-access-jwt-assertion')?.trim() ?? '';
    const identity = await verifyCloudflareAccessAssertion(assertion, {
      teamDomain: c.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
      audience: c.CLOUDFLARE_ACCESS_AUD,
    });

    const [employee] = await db()`
      select id
      from employees
      where lower(email) = lower(${identity.email})
        and active
      limit 1
    `;
    invariant(
      employee,
      'EMPLOYEE_NOT_MAPPED',
      'บัญชี Microsoft ยังไม่ได้ผูกกับพนักงาน กรุณาติดต่อผู้ดูแล',
      403,
    );

    const session = await issueSession(employee.id);
    const response = NextResponse.redirect(new URL('/', c.APP_ORIGIN));
    const common = {
      secure: true,
      sameSite: 'lax' as const,
      path: '/',
      expires: session.expiresAt,
    };
    response.cookies.set(cookieNames().session, session.sessionValue, {
      ...common,
      httpOnly: true,
    });
    response.cookies.set(cookieNames().csrf, session.antiForgeryValue, {
      ...common,
      httpOnly: false,
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const code = error instanceof DomainError ? error.code : 'ACCESS_IDENTITY_FAILED';
    const response = NextResponse.redirect(
      new URL(`/sign-in?reason=${encodeURIComponent(code)}`, config().APP_ORIGIN),
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
