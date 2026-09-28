import { invariant, type Actor } from '../domain/core';
import { db } from './db';

export async function markNotificationRead(
  actor: Actor,
  id: string,
  now = new Date(),
): Promise<void> {
  const rows = await db()`
    update notifications
    set read_at=coalesce(read_at,${now})
    where id=${id} and employee_id=${actor.id}
    returning id
  `;
  invariant(rows.length === 1, 'NOT_FOUND', 'ไม่พบการแจ้งเตือน', 404);
}
