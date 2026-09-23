import { NextResponse } from 'next/server';
import { DomainError } from '@/domain/core';
import { config } from '@/server/config';
import { completeSignIn } from '@/server/oidc';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    return await completeSignIn(request);
  } catch (error) {
    const code = error instanceof DomainError ? error.code : 'IDENTITY_CALLBACK_FAILED';
    return NextResponse.redirect(
      new URL(`/sign-in?reason=${encodeURIComponent(code)}`, config().APP_ORIGIN),
    );
  }
}
