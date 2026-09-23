import { NextResponse } from 'next/server';
import { config } from '@/server/config';
import { cookieNames, cookieValue, revokeSessionValue, verifyAntiForgery } from '@/server/identity';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const form = await request.formData();
  const supplied = form.get('_csrf');
  verifyAntiForgery(request, typeof supplied === 'string' ? supplied : null);

  const names = cookieNames();
  await revokeSessionValue(cookieValue(request, names.session));

  const response = NextResponse.redirect(new URL('/sign-in', config().APP_ORIGIN), 303);
  const production = config().APP_ENV === 'production';
  response.cookies.set(names.session, '', {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(names.csrf, '', {
    httpOnly: false,
    secure: production,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
