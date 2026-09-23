import { NextResponse } from 'next/server';
import { DomainError } from '@/domain/core';
import { config } from '@/server/config';
import { startSignIn } from '@/server/oidc';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return await startSignIn();
  } catch (error) {
    const code = error instanceof DomainError ? error.code : 'IDENTITY_START_FAILED';
    return NextResponse.redirect(
      new URL(`/sign-in?reason=${encodeURIComponent(code)}`, config().APP_ORIGIN),
    );
  }
}
