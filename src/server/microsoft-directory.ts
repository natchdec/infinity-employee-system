import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  DomainError,
  fingerprint,
  invariant,
  requireRole,
  type Actor,
  type Json,
} from '../domain/core';
import { audit, db, enqueue, safeJson } from './db';
import { config } from './config';
import { outlookGraphJson } from './integrations/outlook-auth';

const graphUserSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string().default(''),
    userPrincipalName: z.string().min(1),
    mail: z.string().nullable().optional(),
    accountEnabled: z.boolean().default(false),
    userType: z.string().nullable().optional(),
    createdDateTime: z.string().nullable().optional(),
    jobTitle: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    officeLocation: z.string().nullable().optional(),
  })
  .passthrough();

const graphUserPageSchema = z
  .object({
    value: z.array(graphUserSchema),
    '@odata.nextLink': z.string().url().optional(),
  })
  .passthrough();

type GraphDirectoryUser = z.infer<typeof graphUserSchema>;

export interface MicrosoftDirectoryAccount {
  objectId: string;
  userPrincipalName: string;
  email: string | null;
  displayName: string;
  accountEnabled: boolean;
  userType: string;
  jobTitle: string | null;
  departmentName: string | null;
  officeLocation: string | null;
  linkedEmployeeId: string | null;
  linkedEmployeeName: string | null;
  linkedEmployeeActive: boolean | null;
  reviewState: 'unreviewed' | 'employee' | 'ignored';
  present: boolean;
  lastSyncedAt: Date;
}

export interface MicrosoftDirectoryAdminState {
  accounts: MicrosoftDirectoryAccount[];
  summary: {
    total: number;
    enabledMembers: number;
    guests: number;
    linked: number;
    ignored: number;
    review: number;
  };
  sync: {
    lastSuccessAt: Date | null;
    lastErrorCode: string | null;
    sourceCount: number;
    linkedCount: number;
  } | null;
}

function normalizedEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizedUpn(value: string): string {
  return value.trim().toLowerCase();
}

function safeDisplayName(user: GraphDirectoryUser): string {
  const name = user.displayName.trim() || normalizedUpn(user.userPrincipalName);
  return name.slice(0, 160);
}

function safeGraphUsersNextLink(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new URL(value);
  invariant(
    parsed.protocol === 'https:' &&
      parsed.hostname === 'graph.microsoft.com' &&
      parsed.pathname.startsWith('/v1.0/users'),
    'MICROSOFT_DIRECTORY_RESPONSE_INVALID',
    'Microsoft Graph ส่ง directory cursor ที่ไม่ถูกต้อง',
    503,
  );
  return parsed.toString();
}

function sourceHash(user: GraphDirectoryUser): string {
  return fingerprint({
    id: user.id,
    displayName: user.displayName,
    userPrincipalName: normalizedUpn(user.userPrincipalName),
    mail: normalizedEmail(user.mail),
    accountEnabled: user.accountEnabled,
    userType: user.userType ?? '',
    createdDateTime: user.createdDateTime ?? null,
    jobTitle: user.jobTitle ?? null,
    department: user.department ?? null,
    officeLocation: user.officeLocation ?? null,
  });
}

function syncErrorCode(error: unknown): string {
  return error instanceof DomainError
    ? error.code.slice(0, 120)
    : 'MICROSOFT_DIRECTORY_SYNC_FAILED';
}

async function recordDirectorySyncError(tenantId: string, code: string, now: Date): Promise<void> {
  await db()`
    insert into microsoft_directory_sync_states(
      tenant_id,last_error_code,source_count,linked_count,revision,updated_at
    )
    values(${tenantId}::uuid,${code},0,0,1,${now})
    on conflict(tenant_id)
    do update set
      last_error_code=excluded.last_error_code,
      revision=microsoft_directory_sync_states.revision+1,
      updated_at=excluded.updated_at
  `;
}

export async function syncMicrosoftDirectory(
  now = new Date(),
  auditActor: Actor | null = null,
  correlationId: string = randomUUID(),
): Promise<{ sourceCount: number; linkedCount: number; pages: number }> {
  const settings = config();
  invariant(
    settings.OUTLOOK_CALENDAR_SYNC_ENABLED &&
      settings.OUTLOOK_CALENDAR_TENANT_ID &&
      settings.OUTLOOK_CALENDAR_CLIENT_ID,
    'MICROSOFT_DIRECTORY_NOT_CONFIGURED',
    'Microsoft 365 Directory sync ยังไม่ได้เปิดใช้งาน',
    503,
  );
  const tenantId = settings.OUTLOOK_CALENDAR_TENANT_ID;
  const initial = new URL('https://graph.microsoft.com/v1.0/users');
  initial.searchParams.set(
    '$select',
    'id,displayName,userPrincipalName,mail,accountEnabled,userType,createdDateTime,jobTitle,department,officeLocation',
  );
  initial.searchParams.set('$top', '999');

  const users = new Map<string, GraphDirectoryUser>();
  let pages = 0;
  let nextUrl: string | null = initial.toString();

  try {
    while (nextUrl) {
      invariant(
        ++pages <= 20,
        'MICROSOFT_DIRECTORY_PAGE_LIMIT',
        'Microsoft 365 Directory มีจำนวนหน้ามากเกินขอบเขตที่กำหนด',
        503,
      );
      const page = graphUserPageSchema.parse(await outlookGraphJson(nextUrl));
      for (const user of page.value) users.set(user.id, user);
      nextUrl = safeGraphUsersNextLink(page['@odata.nextLink']);
    }

    const linkedCount = await db().begin(async (tx) => {
      await tx`
        update microsoft_directory_accounts
        set present=false,last_synced_at=${now}
        where tenant_id=${tenantId}::uuid
      `;

      let linked = 0;
      for (const user of users.values()) {
        const upn = normalizedUpn(user.userPrincipalName);
        const email = normalizedEmail(user.mail) ?? normalizedEmail(upn);
        const [employee] = await tx`
          select id
          from employees
          where tenant_id=${tenantId}::uuid
            and entra_object_id=${user.id}::uuid
          limit 1
        `;
        const employeeId = employee?.id ? String(employee.id) : null;
        if (employeeId) linked++;

        await tx`
          insert into microsoft_directory_accounts(
            tenant_id,entra_object_id,user_principal_name,email,display_name,
            account_enabled,user_type,job_title,department_name,office_location,
            created_date_time,linked_employee_id,source_hash,present,last_seen_at,last_synced_at,
            review_state,reviewed_at
          )
          values(
            ${tenantId}::uuid,${user.id}::uuid,${upn},${email},${safeDisplayName(user)},
            ${user.accountEnabled},${user.userType ?? ''},${user.jobTitle ?? null},
            ${user.department ?? null},${user.officeLocation ?? null},
            ${user.createdDateTime ?? null}::timestamptz,${employeeId}::uuid,
            ${sourceHash(user)},true,${now},${now},
            ${employeeId ? 'employee' : 'unreviewed'},${employeeId ? now : null}
          )
          on conflict(tenant_id,entra_object_id)
          do update set
            user_principal_name=excluded.user_principal_name,
            email=excluded.email,
            display_name=excluded.display_name,
            account_enabled=excluded.account_enabled,
            user_type=excluded.user_type,
            job_title=excluded.job_title,
            department_name=excluded.department_name,
            office_location=excluded.office_location,
            created_date_time=excluded.created_date_time,
            linked_employee_id=excluded.linked_employee_id,
            source_hash=excluded.source_hash,
            review_state=case
              when excluded.linked_employee_id is not null then 'employee'
              when microsoft_directory_accounts.review_state='ignored' then 'ignored'
              else 'unreviewed'
            end,
            reviewed_at=case
              when excluded.linked_employee_id is not null then excluded.last_synced_at
              else microsoft_directory_accounts.reviewed_at
            end,
            present=true,
            last_seen_at=excluded.last_seen_at,
            last_synced_at=excluded.last_synced_at
        `;
      }

      await tx`
        insert into microsoft_directory_sync_states(
          tenant_id,last_success_at,last_error_code,source_count,linked_count,revision,updated_at
        )
        values(${tenantId}::uuid,${now},null,${users.size},${linked},1,${now})
        on conflict(tenant_id)
        do update set
          last_success_at=excluded.last_success_at,
          last_error_code=null,
          source_count=excluded.source_count,
          linked_count=excluded.linked_count,
          revision=microsoft_directory_sync_states.revision+1,
          updated_at=excluded.updated_at
      `;
      await audit(
        tx,
        auditActor,
        'microsoft_directory.synced',
        'microsoft_directory',
        tenantId,
        null,
        safeJson({ sourceCount: users.size, linkedCount: linked, pages }),
        correlationId,
      );
      return linked;
    });

    return { sourceCount: users.size, linkedCount, pages };
  } catch (error) {
    await recordDirectorySyncError(tenantId, syncErrorCode(error), now);
    throw error;
  }
}

export async function microsoftDirectoryAdminState(): Promise<MicrosoftDirectoryAdminState> {
  const settings = config();
  const tenantId = settings.OUTLOOK_CALENDAR_TENANT_ID;
  if (!tenantId) {
    return {
      accounts: [],
      summary: { total: 0, enabledMembers: 0, guests: 0, linked: 0, ignored: 0, review: 0 },
      sync: null,
    };
  }

  const [rows, syncRows] = await Promise.all([
    db()`
      select
        a.entra_object_id::text,a.user_principal_name,a.email,a.display_name,
        a.account_enabled,a.user_type,a.job_title,a.department_name,a.office_location,
        a.linked_employee_id,e.display_name as linked_employee_name,e.active as linked_employee_active,
        a.review_state,a.present,a.last_synced_at
      from microsoft_directory_accounts a
      left join employees e on e.id=a.linked_employee_id
      where a.tenant_id=${tenantId}::uuid
      order by a.present desc,a.account_enabled desc,a.display_name,a.user_principal_name
    `,
    db()`
      select last_success_at,last_error_code,source_count,linked_count
      from microsoft_directory_sync_states
      where tenant_id=${tenantId}::uuid
    `,
  ]);

  const accounts = rows.map((row) => ({
    objectId: String(row.entra_object_id),
    userPrincipalName: String(row.user_principal_name),
    email: row.email ? String(row.email) : null,
    displayName: String(row.display_name),
    accountEnabled: Boolean(row.account_enabled),
    userType: String(row.user_type ?? ''),
    jobTitle: row.job_title ? String(row.job_title) : null,
    departmentName: row.department_name ? String(row.department_name) : null,
    officeLocation: row.office_location ? String(row.office_location) : null,
    linkedEmployeeId: row.linked_employee_id ? String(row.linked_employee_id) : null,
    linkedEmployeeName: row.linked_employee_name ? String(row.linked_employee_name) : null,
    linkedEmployeeActive:
      row.linked_employee_active === null || row.linked_employee_active === undefined
        ? null
        : Boolean(row.linked_employee_active),
    reviewState:
      row.review_state === 'employee' || row.review_state === 'ignored'
        ? row.review_state
        : 'unreviewed',
    present: Boolean(row.present),
    lastSyncedAt: row.last_synced_at as Date,
  }));

  const total = accounts.filter((item) => item.present).length;
  const linked = accounts.filter((item) => item.present && item.linkedEmployeeId).length;
  const enabledMembers = accounts.filter(
    (item) => item.present && item.accountEnabled && item.userType.toLowerCase() === 'member',
  ).length;
  const guests = accounts.filter(
    (item) => item.present && item.userType.toLowerCase() === 'guest',
  ).length;
  const ignored = accounts.filter((item) => item.present && item.reviewState === 'ignored').length;
  const review = accounts.filter(
    (item) => item.present && !item.linkedEmployeeId && item.reviewState === 'unreviewed',
  ).length;
  const sync = syncRows[0]
    ? {
        lastSuccessAt: syncRows[0].last_success_at as Date | null,
        lastErrorCode: syncRows[0].last_error_code ? String(syncRows[0].last_error_code) : null,
        sourceCount: Number(syncRows[0].source_count ?? 0),
        linkedCount: Number(syncRows[0].linked_count ?? 0),
      }
    : null;

  return {
    accounts,
    summary: { total, enabledMembers, guests, linked, ignored, review },
    sync,
  };
}

export async function queueDueMicrosoftDirectorySync(now = new Date()): Promise<number> {
  const settings = config();
  if (!settings.OUTLOOK_CALENDAR_SYNC_ENABLED || !settings.OUTLOOK_CALENDAR_TENANT_ID) return 0;
  const intervalMs = settings.OUTLOOK_CALENDAR_SYNC_INTERVAL_MINUTES * 60_000;
  const bucket = Math.floor(now.getTime() / intervalMs);
  const dedupeKey = `microsoft-directory-sync:${settings.OUTLOOK_CALENDAR_TENANT_ID}:${bucket}`;
  const rows = await db()`
    insert into jobs(kind,dedupe_key,payload,available_at)
    values('microsoft_directory_sync',${dedupeKey},'{}'::jsonb,${now})
    on conflict(dedupe_key) do nothing
    returning id
  `;
  return rows.length;
}

export async function enqueueManualMicrosoftDirectorySync(
  actor: Actor,
  idempotencyKey: string,
): Promise<Json> {
  requireRole(actor, 'admin');
  invariant(
    config().OUTLOOK_CALENDAR_SYNC_ENABLED,
    'MICROSOFT_DIRECTORY_NOT_CONFIGURED',
    'Microsoft 365 Directory sync ยังไม่ได้เปิดใช้งาน',
    503,
  );
  const jobKey = `microsoft-directory-manual:${actor.id}:${idempotencyKey}`;
  await db().begin(async (tx) => {
    await enqueue(tx, 'microsoft_directory_sync', jobKey, {});
  });
  return safeJson({ queued: true, jobKey });
}
