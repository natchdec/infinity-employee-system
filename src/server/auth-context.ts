import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { actorForSessionValue, cookieNames } from './identity';
import { invariant, type Actor, type Role } from '../domain/core';

export async function currentActor(): Promise<Actor | null> {
  const store = await cookies();
  return actorForSessionValue(store.get(cookieNames().session)?.value);
}

export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  return actor;
}

export function requirePageRole(actor: Actor, ...allowed: Role[]): void {
  invariant(
    allowed.some((role) => actor.roles.includes(role)),
    'FORBIDDEN',
    'คุณไม่มีสิทธิ์เปิดหน้าทำงานนี้',
    403,
  );
}
