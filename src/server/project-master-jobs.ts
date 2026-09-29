import { requireRole, type Actor, type Json } from '../domain/core';
import { db, enqueue, safeJson } from './db';
import { projectMasterConfigured } from './integrations/project-master';

export async function queueDueProjectMasterSync(now = new Date()): Promise<number> {
  if (!projectMasterConfigured()) return 0;
  const bucket = Math.floor(now.getTime() / (60 * 60_000));
  const dedupeKey = `project-master-sync:${bucket}`;
  const rows = await db()`
    insert into jobs(kind,dedupe_key,payload,available_at)
    values('project_master_sync',${dedupeKey},'{}'::jsonb,${now})
    on conflict(dedupe_key) do nothing
    returning id
  `;
  return rows.length;
}

export async function enqueueManualProjectMasterSync(
  actor: Actor,
  idempotencyKey: string,
): Promise<Json> {
  requireRole(actor, 'admin');
  const jobKey = `project-master-manual:${actor.id}:${idempotencyKey}`;
  await db().begin(async (tx) => {
    await enqueue(tx, 'project_master_sync', jobKey, {});
  });
  return safeJson({ queued: true, jobKey });
}
