import { z } from 'zod';
import { invariant } from '../../domain/core';
import { config } from '../config';
import { db } from '../db';
import { outlookGraphPostJson } from './outlook-auth';

const emailNoticeSchema = z
  .object({
    employeeId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    detail: z.string().trim().min(1).max(1000),
    href: z.string().startsWith('/').max(500),
  })
  .strict();

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendEmployeeEmailNotification(raw: unknown): Promise<{
  delivered: boolean;
  employeeId: string;
  sender: string;
}> {
  const value = emailNoticeSchema.parse(raw);
  const settings = config();
  invariant(
    settings.EMAIL_NOTIFICATIONS_ENABLED,
    'EMAIL_NOTIFICATIONS_DISABLED',
    'Email notifications ยังไม่ได้เปิดใช้งาน',
    503,
  );
  const sender = settings.EMAIL_NOTIFICATION_SENDER;
  invariant(
    sender === 'hr@infinitysolutions.co.th',
    'EMAIL_SENDER_NOT_ALLOWED',
    'Email notification sender ไม่อยู่ในขอบเขตที่อนุญาต',
    503,
  );

  const [employee] = await db()`
    select email
    from employees
    where id=${value.employeeId}
  `;
  invariant(employee?.email, 'EMAIL_RECIPIENT_NOT_FOUND', 'ไม่พบอีเมลผู้รับในระบบ', 404);

  const origin = new URL(settings.APP_ORIGIN);
  const target = new URL(value.href, origin);
  invariant(
    target.origin === origin.origin,
    'EMAIL_LINK_INVALID',
    'ลิงก์แจ้งเตือนไม่อยู่ใน Employee System',
    500,
  );

  const html = [
    '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#202124">',
    `<h2 style="margin:0 0 12px">${escapeHtml(value.title)}</h2>`,
    `<p>${escapeHtml(value.detail)}</p>`,
    `<p><a href="${escapeHtml(target.toString())}">เปิดรายการใน Infinity Employee System</a></p>`,
    '<p style="color:#6b7280;font-size:12px">ข้อความอัตโนมัติจาก Infinity People Operations</p>',
    '</div>',
  ].join('');

  await outlookGraphPostJson(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      message: {
        subject: `[Infinity People] ${value.title}`,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: String(employee.email) } }],
      },
      saveToSentItems: true,
    },
  );

  return { delivered: true, employeeId: value.employeeId, sender };
}
