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

const approvalDigestSchema = z
  .object({
    employeeId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

const requestKindLabel: Record<string, string> = {
  leave: 'ลา',
  ot: 'OT',
  expense: 'ค่าใช้จ่าย',
  trip: 'เดินทาง',
  advance: 'เงินทดรอง',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatSatang(value: unknown): string {
  const satang = BigInt(String(value ?? '0'));
  const whole = satang / 100n;
  const fraction = (satang % 100n).toString().padStart(2, '0');
  return `${whole.toLocaleString('en-US')}.${fraction}`;
}

function mailRuntime() {
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
  return { settings, sender };
}

export async function sendEmployeeEmailNotification(raw: unknown): Promise<{
  delivered: boolean;
  employeeId: string;
  sender: string;
}> {
  const value = emailNoticeSchema.parse(raw);
  const { settings, sender } = mailRuntime();

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

export async function sendApprovalDigestEmail(raw: unknown): Promise<{
  delivered: boolean;
  employeeId: string;
  sender: string;
  count: number;
}> {
  const value = approvalDigestSchema.parse(raw);
  const { settings, sender } = mailRuntime();

  const [employee] = await db()`
    select email,display_name
    from employees
    where id=${value.employeeId} and active
  `;
  invariant(employee?.email, 'EMAIL_RECIPIENT_NOT_FOUND', 'ไม่พบอีเมลผู้รับในระบบ', 404);

  const requests = await db()`
    select
      r.id,
      r.reference,
      r.kind,
      r.title,
      r.business_date::text,
      r.total_satang::text,
      r.updated_at,
      e.display_name as requester_name
    from requests r
    join employees e on e.id=r.employee_id
    where r.employee_id<>${value.employeeId}
      and (
        (
          r.workflow_state='pending_head'
          and (
            r.assigned_head_id=${value.employeeId}
            or exists(
              select 1
              from approval_delegations d
              where d.delegator_id=r.assigned_head_id
                and d.delegate_id=${value.employeeId}
                and d.active
                and d.scope='manager_approval'
                and d.effective_from<=${value.date}::date
                and d.effective_to>=${value.date}::date
            )
          )
        )
        or (
          r.final_approval_state='pending'
          and r.assigned_final_approver_id=${value.employeeId}
        )
      )
    order by r.updated_at asc,r.reference
    limit 100
  `;

  if (!requests.length) {
    return { delivered: false, employeeId: value.employeeId, sender, count: 0 };
  }

  const origin = new URL(settings.APP_ORIGIN);
  const inbox = new URL('/approvals', origin);
  invariant(
    inbox.origin === origin.origin,
    'EMAIL_LINK_INVALID',
    'ลิงก์แจ้งเตือนไม่อยู่ใน Employee System',
    500,
  );

  const rows = requests
    .map((row) => {
      const detailUrl = new URL(`/requests/${String(row.id)}`, origin);
      const amount = BigInt(String(row.total_satang ?? '0'));
      const amountText =
        amount > 0n
          ? `<span style="white-space:nowrap;color:#3c4650">${formatSatang(amount)} บาท</span>`
          : '';
      return [
        '<tr>',
        '<td style="padding:12px 10px;border-bottom:1px solid #eee7df;vertical-align:top">',
        `<a href="${escapeHtml(detailUrl.toString())}" style="color:#d94b10;text-decoration:none;font-weight:700">${escapeHtml(String(row.reference))}</a>`,
        `<div style="margin-top:3px;color:#20272d;font-weight:600">${escapeHtml(requestKindLabel[String(row.kind)] ?? String(row.kind))} · ${escapeHtml(String(row.title))}</div>`,
        `<div style="margin-top:3px;color:#737c86;font-size:12px">${escapeHtml(String(row.requester_name))} · ${escapeHtml(String(row.business_date))}</div>`,
        '</td>',
        `<td style="padding:12px 10px;border-bottom:1px solid #eee7df;text-align:right;vertical-align:top">${amountText}</td>`,
        '</tr>',
      ].join('');
    })
    .join('');

  const count = requests.length;
  const html = [
    '<div style="margin:0;padding:24px;background:#f7f3ee;font-family:Arial,sans-serif;color:#20272d">',
    '<div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e8e1d9;border-radius:10px;overflow:hidden">',
    '<div style="padding:20px 24px;background:#20262b;color:#ffffff">',
    '<div style="font-size:12px;color:#f6a044;font-weight:700">INFINITY SOLUTION SERVICE</div>',
    '<h2 style="margin:6px 0 0;font-size:22px">Approval Digest</h2>',
    '</div>',
    '<div style="padding:22px 24px">',
    `<p style="margin:0 0 6px">สวัสดี ${escapeHtml(String(employee.display_name))}</p>`,
    `<p style="margin:0 0 18px;color:#5c646b">เช้านี้มี <strong style="color:#d94b10">${count} รายการ</strong> รอการอนุมัติของคุณ</p>`,
    '<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee7df">',
    rows,
    '</table>',
    `<p style="margin:22px 0 0"><a href="${escapeHtml(inbox.toString())}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#e84a0c;color:#fff;text-decoration:none;font-weight:700">เปิด Approval Inbox</a></p>`,
    '<p style="margin:18px 0 0;color:#8a8f94;font-size:11px">Digest ส่งวันละครั้งตอนเช้า รายการใหม่ยังคงมีอีเมลแจ้งทันทีแยกตาม Request</p>',
    '</div></div></div>',
  ].join('');

  await outlookGraphPostJson(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      message: {
        subject: `[Infinity People] ${count} รายการรออนุมัติ · ${value.date}`,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: String(employee.email) } }],
      },
      saveToSentItems: true,
    },
  );

  return { delivered: true, employeeId: value.employeeId, sender, count };
}
