import { invariant } from '../../domain/core';
import { config } from '../config';

export interface TeamsWorkflowNotice {
  title: string;
  detail: string;
  href: string;
}

export function teamsWorkflowPayload(
  notice: TeamsWorkflowNotice,
  origin: string,
): { text: string } {
  invariant(
    notice.href.startsWith('/') && !notice.href.startsWith('//'),
    'TEAMS_NOTIFICATION_LINK_INVALID',
    'Teams notification link ต้องเป็น path ภายใน Employee System',
    500,
  );
  const appOrigin = new URL(origin);
  const absoluteUrl = new URL(notice.href, appOrigin);
  invariant(
    absoluteUrl.origin === appOrigin.origin,
    'TEAMS_NOTIFICATION_LINK_INVALID',
    'Teams notification link ต้องอยู่ภายใน Employee System',
    500,
  );
  return {
    text: [notice.title.trim(), notice.detail.trim(), absoluteUrl.toString()]
      .filter(Boolean)
      .join('\n'),
  };
}

export async function sendTeamsWorkflowNotice(
  notice: TeamsWorkflowNotice,
): Promise<{ delivered: true; status: number }> {
  const settings = config();
  invariant(
    settings.TEAMS_NOTIFICATIONS_ENABLED && settings.TEAMS_NOTIFICATION_WEBHOOK_URL,
    'TEAMS_NOTIFICATIONS_NOT_CONFIGURED',
    'Teams notifications ยังไม่ได้เปิดใช้งานหรือยังไม่มี Workflow webhook',
    503,
  );

  const response = await fetch(settings.TEAMS_NOTIFICATION_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(teamsWorkflowPayload(notice, settings.APP_ORIGIN)),
    signal: AbortSignal.timeout(8000),
  });
  invariant(
    response.ok,
    'TEAMS_NOTIFICATION_DELIVERY_FAILED',
    'Teams Workflow webhook ตอบกลับ HTTP ' + response.status,
    502,
  );
  return { delivered: true, status: response.status };
}
