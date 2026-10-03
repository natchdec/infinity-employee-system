import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { DomainError, invariant } from '../domain/core';

type AccessJwk = {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
};

type AccessHeader = { alg?: unknown; kid?: unknown };
type AccessPayload = {
  iss?: unknown;
  aud?: unknown;
  email?: unknown;
  sub?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
};

export interface CloudflareAccessIdentity {
  email: string;
  subject: string;
}

export interface CloudflareAccessSettings {
  teamDomain: string;
  audience: string;
  nowSeconds?: number;
}
let jwksCache:
  | {
      teamDomain: string;
      expiresAt: number;
      keys: AccessJwk[];
    }
  | undefined;

function decodeJsonSegment<T>(segment: string): T {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    throw new DomainError('ACCESS_TOKEN_INVALID', 'Cloudflare Access token is malformed', 403);
  }
}

function expectedIssuer(teamDomain: string): string {
  return `https://${teamDomain}`;
}

function normalizeAudience(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value as string[];
  }
  return [];
}

export function validateCloudflareAccessClaims(
  header: AccessHeader,
  payload: AccessPayload,
  settings: CloudflareAccessSettings,
): CloudflareAccessIdentity {
  const now = settings.nowSeconds ?? Math.floor(Date.now() / 1000);
  invariant(
    header.alg === 'RS256' && typeof header.kid === 'string' && header.kid.length > 0,
    'ACCESS_TOKEN_ALGORITHM_REJECTED',
    'Cloudflare Access token algorithm is not accepted',
    403,
  );
  invariant(
    payload.iss === expectedIssuer(settings.teamDomain),
    'ACCESS_TOKEN_ISSUER_REJECTED',
    'Cloudflare Access token issuer does not match this application',
    403,
  );
  invariant(
    normalizeAudience(payload.aud).includes(settings.audience),
    'ACCESS_TOKEN_AUDIENCE_REJECTED',
    'Cloudflare Access token audience does not match this application',
    403,
  );
  invariant(
    typeof payload.exp === 'number' && payload.exp > now - 30,
    'ACCESS_TOKEN_EXPIRED',
    'Cloudflare Access token has expired',
    403,
  );
  invariant(
    typeof payload.nbf !== 'number' || payload.nbf <= now + 30,
    'ACCESS_TOKEN_NOT_ACTIVE',
    'Cloudflare Access token is not active yet',
    403,
  );
  invariant(
    typeof payload.iat !== 'number' || payload.iat <= now + 30,
    'ACCESS_TOKEN_TIME_INVALID',
    'Cloudflare Access token issue time is invalid',
    403,
  );
  invariant(
    typeof payload.email === 'string' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim()) &&
      typeof payload.sub === 'string' &&
      payload.sub.length > 0,
    'ACCESS_IDENTITY_INVALID',
    'Cloudflare Access identity is incomplete',
    403,
  );
  return {
    email: payload.email.trim().toLowerCase(),
    subject: payload.sub,
  };
}

async function loadJwks(teamDomain: string, force = false): Promise<AccessJwk[]> {
  if (!force && jwksCache?.teamDomain === teamDomain && jwksCache.expiresAt > Date.now()) {
    return jwksCache.keys;
  }

  let response: Response;
  try {
    response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new DomainError(
      'ACCESS_KEYS_UNAVAILABLE',
      'Cloudflare Access signing keys are unavailable',
      503,
    );
  }
  if (!response.ok) {
    throw new DomainError(
      'ACCESS_KEYS_UNAVAILABLE',
      'Cloudflare Access signing keys are unavailable',
      503,
    );
  }

  const document = (await response.json()) as { keys?: unknown };
  invariant(
    Array.isArray(document.keys) && document.keys.length > 0,
    'ACCESS_KEYS_INVALID',
    'Cloudflare Access signing keys are invalid',
    503,
  );
  const keys = document.keys.filter(
    (item): item is AccessJwk =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as AccessJwk).kid === 'string' &&
      (item as AccessJwk).kty === 'RSA' &&
      typeof (item as AccessJwk).n === 'string' &&
      typeof (item as AccessJwk).e === 'string',
  );
  invariant(
    keys.length > 0,
    'ACCESS_KEYS_INVALID',
    'Cloudflare Access signing keys are invalid',
    503,
  );

  jwksCache = {
    teamDomain,
    keys,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  return keys;
}

async function signingKey(teamDomain: string, kid: string): Promise<AccessJwk> {
  let keys = await loadJwks(teamDomain);
  let key = keys.find((candidate) => candidate.kid === kid);
  if (!key) {
    keys = await loadJwks(teamDomain, true);
    key = keys.find((candidate) => candidate.kid === kid);
  }
  invariant(key, 'ACCESS_KEY_NOT_FOUND', 'Cloudflare Access signing key is not recognized', 403);
  return key;
}
export async function verifyCloudflareAccessAssertion(
  assertion: string,
  settings: CloudflareAccessSettings,
): Promise<CloudflareAccessIdentity> {
  invariant(
    assertion.length > 0 && assertion.length <= 16384,
    'ACCESS_ASSERTION_INVALID',
    'Cloudflare Access assertion is missing or invalid',
    403,
  );
  const parts = assertion.split('.');
  invariant(
    parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)),
    'ACCESS_ASSERTION_INVALID',
    'Cloudflare Access assertion is malformed',
    403,
  );

  const header = decodeJsonSegment<AccessHeader>(parts[0]!);
  const payload = decodeJsonSegment<AccessPayload>(parts[1]!);
  const identity = validateCloudflareAccessClaims(header, payload, settings);
  const key = await signingKey(settings.teamDomain, header.kid as string);

  let verified = false;
  try {
    const publicKey = createPublicKey({
      key: { kty: key.kty!, n: key.n!, e: key.e! } as import('node:crypto').JsonWebKey,
      format: 'jwk',
    });
    verified = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2]!, 'base64url'),
    );
  } catch {
    verified = false;
  }
  invariant(
    verified,
    'ACCESS_ASSERTION_SIGNATURE_REJECTED',
    'Cloudflare Access assertion signature is invalid',
    403,
  );
  return identity;
}
