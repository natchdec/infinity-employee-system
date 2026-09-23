import postgres, { type Sql } from 'postgres';
import path from 'node:path';

/** Translate the explicit UAT Unix-socket extension before giving the URL to Postgres.js. */
export function connectDatabase(
  rawUrl: string,
  options: { max?: number; applicationName?: string } = {},
): Sql {
  const url = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Unsupported database transport');
  const socket = url.searchParams.get('host');
  url.searchParams.delete('host');
  if (socket) {
    const permitted = path.resolve(process.cwd(), 'data/uat');
    if (
      process.env.APP_ENV === 'production' ||
      !path.resolve(socket).startsWith(permitted + path.sep)
    )
      throw new Error('Unix test socket is outside the isolated UAT directory');
  }
  return postgres(url.toString(), {
    ...(socket ? { host: socket } : {}),
    max: options.max ?? 8,
    idle_timeout: 20,
    connect_timeout: 5,
    onnotice: () => {},
    connection: { application_name: options.applicationName ?? 'infinity-employee-app' },
  });
}
