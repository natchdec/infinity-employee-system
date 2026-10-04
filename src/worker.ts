import { hostname } from 'node:os';
import { z } from 'zod';
import { closeDb, db, safeJson } from './server/db';
import {
  sendApprovalDigestEmail,
  sendEmployeeEmailNotification,
} from './server/integrations/email-notification';
import { sendTeamsWorkflowNotice } from './server/integrations/teams-workflow';
import { log } from './server/logging';
import {
  queueDueMicrosoftDirectorySync,
  syncMicrosoftDirectory,
} from './server/microsoft-directory';
import { queueApprovalDigestEmails, queueOperationalReminders } from './server/reminder-service';
import { queueDueProjectMasterSync } from './server/project-master-jobs';
import { syncProjectMaster } from './server/integrations/project-master';
import { queueDueOutlookCalendarSyncs, syncEmployeeOutlookCalendar } from './server/worklog';

const noticeSchema = z
  .object({
    employeeId: z.string().uuid(),
    title: z.string().min(1).max(200),
    href: z.string().startsWith('/').max(500),
  })
  .strict();

const teamsNoticeSchema = z
  .object({
    title: z.string().min(1).max(200),
    detail: z.string().min(1).max(1000),
    href: z.string().startsWith('/').max(500),
  })
  .strict();

const calendarSyncSchema = z
  .object({
    employeeId: z.string().uuid(),
  })
  .strict();

const workerId = `${hostname()}:${process.pid}`;
let stopping = false;
let nextCalendarScheduleCheck = 0;
let nextDirectoryScheduleCheck = 0;
let nextReminderScheduleCheck = 0;
let nextProjectMasterScheduleCheck = 0;

async function heartbeat(state: 'running' | 'stopping'): Promise<void> {
  await db()`
    insert into runtime_heartbeats(worker_id, last_seen_at, state, details)
    values(${workerId}, now(), ${state}, '{}'::jsonb)
    on conflict(worker_id)
    do update set last_seen_at = excluded.last_seen_at, state = excluded.state
  `;
}

async function markJobSucceeded(id: string, result: unknown): Promise<void> {
  await db()`
    update jobs
    set state='succeeded',
        result=${db().json(safeJson(result))},
        error_code=null,
        locked_by=null,
        locked_until=null,
        updated_at=now()
    where id=${id} and locked_by=${workerId}
  `;
}

async function scheduleCalendarSyncs(): Promise<void> {
  const now = Date.now();
  if (now < nextCalendarScheduleCheck) return;
  nextCalendarScheduleCheck = now + 60_000;
  try {
    const queued = await queueDueOutlookCalendarSyncs(new Date(now));
    if (queued > 0) log('info', 'outlook_calendar_sync_queued', { queued });
  } catch (error) {
    log('error', 'outlook_calendar_schedule_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}

async function scheduleDirectorySyncs(): Promise<void> {
  const now = Date.now();
  if (now < nextDirectoryScheduleCheck) return;
  nextDirectoryScheduleCheck = now + 60_000;
  try {
    const queued = await queueDueMicrosoftDirectorySync(new Date(now));
    if (queued > 0) log('info', 'microsoft_directory_sync_queued', { queued });
  } catch (error) {
    log('error', 'microsoft_directory_schedule_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}

async function scheduleProjectMasterSyncs(): Promise<void> {
  const now = Date.now();
  if (now < nextProjectMasterScheduleCheck) return;
  nextProjectMasterScheduleCheck = now + 60_000;
  try {
    const queued = await queueDueProjectMasterSync(new Date(now));
    if (queued > 0) log('info', 'project_master_sync_queued', { queued });
  } catch (error) {
    log('error', 'project_master_schedule_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}

async function scheduleReminders(): Promise<void> {
  const now = Date.now();
  if (now < nextReminderScheduleCheck) return;
  nextReminderScheduleCheck = now + 5 * 60_000;
  try {
    const instant = new Date(now);
    const [queued, approvalDigests] = await Promise.all([
      queueOperationalReminders(instant),
      queueApprovalDigestEmails(instant),
    ]);
    if (queued > 0) log('info', 'operational_reminders_created', { queued });
    if (approvalDigests > 0)
      log('info', 'approval_digest_emails_queued', { queued: approvalDigests });
  } catch (error) {
    log('error', 'operational_reminder_schedule_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}

async function runOne(): Promise<boolean> {
  const claimed = await db().begin(async (tx) => {
    const [job] = await tx`
      select id, kind, dedupe_key, payload, attempts
      from jobs
      where state = 'queued'
        and available_at <= now()
        and (locked_until is null or locked_until < now())
      order by available_at, created_at, id
      for update skip locked
      limit 1
    `;
    if (!job) return null;
    await tx`
      update jobs
      set state = 'running',
          attempts = attempts + 1,
          locked_by = ${workerId},
          locked_until = now() + interval '90 seconds',
          updated_at = now()
      where id = ${job.id}
    `;
    return job;
  });

  if (!claimed) return false;

  try {
    if (claimed.kind === 'in_app_notification') {
      const value = noticeSchema.parse(claimed.payload);
      await db().begin(async (tx) => {
        await tx`
          insert into notifications(employee_id, event_key, kind, title, href)
          values(${value.employeeId}, ${claimed.dedupe_key}, 'in_app', ${value.title}, ${value.href})
          on conflict(event_key) do nothing
        `;
        await tx`
          update jobs
          set state = 'succeeded',
              result = '{"delivered":true}'::jsonb,
              locked_by = null,
              locked_until = null,
              updated_at = now()
          where id = ${claimed.id} and locked_by = ${workerId}
        `;
      });
    } else if (claimed.kind === 'email_notification') {
      const result = await sendEmployeeEmailNotification(claimed.payload);
      await markJobSucceeded(String(claimed.id), result);
    } else if (claimed.kind === 'approval_digest_email') {
      const result = await sendApprovalDigestEmail(claimed.payload);
      await markJobSucceeded(String(claimed.id), result);
    } else if (claimed.kind === 'teams_workflow_notification') {
      const value = teamsNoticeSchema.parse(claimed.payload);
      const result = await sendTeamsWorkflowNotice(value);
      await markJobSucceeded(String(claimed.id), result);
    } else if (claimed.kind === 'outlook_calendar_sync') {
      const value = calendarSyncSchema.parse(claimed.payload);
      const result = await syncEmployeeOutlookCalendar(value.employeeId, new Date());
      await markJobSucceeded(String(claimed.id), result);
    } else if (claimed.kind === 'microsoft_directory_sync') {
      const result = await syncMicrosoftDirectory(new Date());
      await markJobSucceeded(String(claimed.id), result);
    } else if (claimed.kind === 'project_master_sync') {
      const result = await syncProjectMaster(new Date());
      await markJobSucceeded(String(claimed.id), result);
    } else {
      await db()`
        update jobs
        set state = 'blocked',
            error_code = 'UNSUPPORTED_JOB_KIND',
            locked_by = null,
            locked_until = null,
            updated_at = now()
        where id = ${claimed.id} and locked_by = ${workerId}
      `;
    }
    return true;
  } catch (error) {
    const retryable = claimed.attempts + 1 < 5;
    await db()`
      update jobs
      set state = ${retryable ? 'queued' : 'failed'},
          available_at = case when ${retryable} then now() + interval '30 seconds' else available_at end,
          error_code = 'JOB_HANDLER_FAILED',
          locked_by = null,
          locked_until = null,
          updated_at = now()
      where id = ${claimed.id} and locked_by = ${workerId}
    `;
    log('error', 'worker_job_failed', {
      jobId: claimed.id,
      kind: claimed.kind,
      retryable,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return true;
  }
}

async function main(): Promise<void> {
  log('info', 'worker_started', { workerId });
  while (!stopping) {
    await heartbeat('running');
    await scheduleCalendarSyncs();
    await scheduleDirectorySyncs();
    await scheduleProjectMasterSyncs();
    await scheduleReminders();
    const worked = await runOne();
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await heartbeat('stopping');
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    stopping = true;
  });
}

main()
  .catch((error) => {
    log('error', 'worker_fatal', {
      workerId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
