import * as client from 'openid-client';
import { DomainError, invariant } from '../../domain/core';
import { config } from '../config';
import { certificateClientAuth } from '../oidc';

const GRAPH_ORIGIN = 'https://graph.microsoft.com';
let discovery: Promise<client.Configuration> | undefined;
let tokenCache: { accessToken: string; expiresAt: number } | undefined;

function graphUrl(value: string): URL {
  const parsed = new URL(value);
  invariant(
    parsed.protocol === 'https:' &&
      parsed.origin === GRAPH_ORIGIN &&
      parsed.pathname.startsWith('/v1.0/'),
    'OUTLOOK_CALENDAR_GRAPH_URL_INVALID',
    'Microsoft Graph URL ไม่อยู่ในขอบเขตที่อนุญาต',
    503,
  );
  return parsed;
}

async function graphConfiguration(): Promise<client.Configuration> {
  const settings = config();
  const tenant = settings.OUTLOOK_CALENDAR_TENANT_ID;
  const clientId = settings.OUTLOOK_CALENDAR_CLIENT_ID;
  invariant(
    tenant && clientId,
    'OUTLOOK_CALENDAR_NOT_CONFIGURED',
    'Outlook Calendar sync ยังไม่ได้ตั้งค่า tenant และ application',
    503,
  );

  discovery ??= (async () => {
    const authentication =
      settings.OUTLOOK_CALENDAR_CLIENT_AUTH_MODE === 'certificate'
        ? await (async () => {
            invariant(
              settings.OUTLOOK_CALENDAR_CLIENT_PRIVATE_KEY_PATH &&
                settings.OUTLOOK_CALENDAR_CLIENT_CERT_PATH,
              'OUTLOOK_CALENDAR_NOT_CONFIGURED',
              'Outlook Calendar sync ยังไม่ได้ตั้งค่า certificate',
              503,
            );
            return certificateClientAuth(
              settings.OUTLOOK_CALENDAR_CLIENT_PRIVATE_KEY_PATH,
              settings.OUTLOOK_CALENDAR_CLIENT_CERT_PATH,
            );
          })()
        : (() => {
            invariant(
              settings.OUTLOOK_CALENDAR_CLIENT_AUTH,
              'OUTLOOK_CALENDAR_NOT_CONFIGURED',
              'Outlook Calendar sync ยังไม่ได้ตั้งค่า client credential',
              503,
            );
            return client.ClientSecretPost(settings.OUTLOOK_CALENDAR_CLIENT_AUTH);
          })();

    return client.discovery(
      new URL(`https://login.microsoftonline.com/${tenant}/v2.0`),
      clientId,
      undefined,
      authentication,
    );
  })().catch((error) => {
    discovery = undefined;
    throw new DomainError(
      'OUTLOOK_CALENDAR_AUTH_UNAVAILABLE',
      error instanceof Error
        ? `เชื่อมต่อ Microsoft Graph authentication ไม่สำเร็จ: ${error.message}`
        : 'เชื่อมต่อ Microsoft Graph authentication ไม่สำเร็จ',
      503,
    );
  });

  return discovery;
}

async function graphAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.accessToken;

  const response = await client.clientCredentialsGrant(await graphConfiguration(), {
    scope: 'https://graph.microsoft.com/.default',
  });
  invariant(
    response.access_token,
    'OUTLOOK_CALENDAR_AUTH_UNAVAILABLE',
    'Microsoft Graph ไม่ส่ง access token กลับมา',
    503,
  );
  const expiresIn = Number(response.expires_in ?? 300);
  tokenCache = {
    accessToken: response.access_token,
    expiresAt: now + Math.max(60, expiresIn) * 1000,
  };
  return tokenCache.accessToken;
}

export async function outlookGraphJson(url: string): Promise<unknown> {
  const target = graphUrl(url);
  let response: Response;
  try {
    const accessToken = await graphAccessToken();
    response = await fetch(target, {
      headers: {
        Authorization: 'Bearer ' + accessToken,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
  } catch {
    throw new DomainError(
      'OUTLOOK_CALENDAR_GRAPH_UNAVAILABLE',
      'เชื่อมต่อ Microsoft Graph ไม่สำเร็จ',
      503,
    );
  }

  if (!response.ok) {
    if (response.status === 401) tokenCache = undefined;
    let graphCode = '';
    try {
      const body = (await response.json()) as { error?: { code?: string } };
      graphCode = body.error?.code?.slice(0, 80) ?? '';
    } catch {
      graphCode = '';
    }
    throw new DomainError(
      response.status === 401 || response.status === 403
        ? 'OUTLOOK_CALENDAR_GRAPH_FORBIDDEN'
        : 'OUTLOOK_CALENDAR_GRAPH_FAILED',
      graphCode
        ? `Microsoft Graph ปฏิเสธคำขอ (${graphCode})`
        : `Microsoft Graph ตอบ HTTP ${response.status}`,
      503,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new DomainError(
      'OUTLOOK_CALENDAR_GRAPH_RESPONSE_INVALID',
      'Microsoft Graph ส่งข้อมูลที่อ่านไม่ได้',
      503,
    );
  }
}

export function resetOutlookGraphAuthForTests(): void {
  discovery = undefined;
  tokenCache = undefined;
}
