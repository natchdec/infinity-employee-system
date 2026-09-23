import * as client from 'openid-client';
import { NextResponse } from 'next/server';
import { config } from './config';
import { db } from './db';
import { DomainError, invariant } from '../domain/core';
import { cookieNames, cookieValue, digestOpaque, issueSession } from './identity';

let discovery: Promise<client.Configuration> | undefined;

async function oidc(): Promise<client.Configuration> {
  const c = config();
  const tenant = c.ENTRA_TENANT_ID;
  const clientId = c.ENTRA_CLIENT_ID;
  const clientAuth = c.ENTRA_CLIENT_AUTH;

  invariant(
    tenant && clientId && clientAuth,
    'ENTRA_NOT_CONFIGURED',
    'ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ Microsoft Entra',
    503,
  );
  invariant(
    /^[0-9a-f-]{36}$/i.test(tenant) && /^[0-9a-f-]{36}$/i.test(clientId),
    'ENTRA_CONFIGURATION_INVALID',
    'ต้องกำหนด tenant และ application ที่เจาะจง',
    503,
  );

  discovery ??= client
    .discovery(
      new URL(`https://login.microsoftonline.com/${tenant}/v2.0`),
      clientId,
      undefined,
      client.ClientSecretPost(clientAuth),
    )
    .catch(() => {
      discovery = undefined;
      throw new DomainError(
        'IDENTITY_PROVIDER_UNAVAILABLE',
        'เชื่อมต่อผู้ให้บริการ Microsoft ไม่สำเร็จ กรุณาลองใหม่',
        503,
      );
    });

  return discovery;
}

export async function startSignIn(): Promise<NextResponse> {
  const provider = await oidc();
  const verifier = client.randomPKCECodeVerifier();
  const challenge = await client.calculatePKCECodeChallenge(verifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  await db()`delete from auth_flows where expires_at < now()`;
  await db()`
    insert into auth_flows(state_hash, nonce, verifier, expires_at)
    values(${digestOpaque(state)}, ${nonce}, ${verifier}, ${new Date(Date.now() + 10 * 60 * 1000)})
  `;

  const url = client.buildAuthorizationUrl(provider, {
    redirect_uri: `${config().APP_ORIGIN}/auth/callback`,
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    response_type: 'code',
  });

  const response = NextResponse.redirect(url);
  response.cookies.set(cookieNames().flow, state, {
    httpOnly: true,
    secure: config().APP_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
    maxAge: 600,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function completeSignIn(request: Request): Promise<NextResponse> {
  const incoming = new URL(request.url);
  const state = incoming.searchParams.get('state');
  const browserState = cookieValue(request, cookieNames().flow);

  invariant(
    state && browserState && state === browserState && /^[A-Za-z0-9_-]{43}$/.test(state),
    'LOGIN_STATE_INVALID',
    'คำขอเข้าสู่ระบบหมดอายุหรือไม่ตรงกับเบราว์เซอร์นี้',
    400,
  );

  const [flow] = await db()`
    delete from auth_flows
    where state_hash = ${digestOpaque(state)} and expires_at > now()
    returning nonce, verifier
  `;
  invariant(flow, 'LOGIN_FLOW_EXPIRED', 'คำขอเข้าสู่ระบบถูกใช้แล้วหรือหมดอายุ กรุณาเริ่มใหม่', 400);
  invariant(
    !incoming.searchParams.has('error'),
    'LOGIN_DENIED',
    'การเข้าสู่ระบบ Microsoft ถูกยกเลิกหรือไม่ได้รับอนุญาต',
    403,
  );

  const provider = await oidc();
  const trustedCallback = new URL('/auth/callback', config().APP_ORIGIN);
  trustedCallback.search = incoming.search;
  const exchange = await client.authorizationCodeGrant(provider, trustedCallback, {
    pkceCodeVerifier: flow.verifier,
    expectedState: state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  });
  const claims = exchange.claims();

  invariant(
    claims && claims.tid === config().ENTRA_TENANT_ID && typeof claims.oid === 'string',
    'TENANT_IDENTITY_REJECTED',
    'บัญชีไม่ได้อยู่ในองค์กรที่กำหนด',
    403,
  );

  const [employee] = await db()`
    select id
    from employees
    where tenant_id = ${claims.tid as string}::uuid
      and entra_object_id = ${claims.oid}::uuid
      and active
  `;
  invariant(
    employee,
    'EMPLOYEE_NOT_MAPPED',
    'บัญชี Microsoft ยังไม่ได้ผูกกับพนักงาน กรุณาติดต่อผู้ดูแล',
    403,
  );

  const session = await issueSession(employee.id);
  const response = NextResponse.redirect(new URL('/', config().APP_ORIGIN));
  const common = {
    secure: config().APP_ENV === 'production',
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
  response.cookies.set(cookieNames().flow, '', {
    httpOnly: true,
    secure: common.secure,
    sameSite: 'lax',
    path: '/auth',
    maxAge: 0,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
