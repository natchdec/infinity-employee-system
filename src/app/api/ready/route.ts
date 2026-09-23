import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [database] = await db()`
      select
        current_database() as name,
        to_regclass('public.schema_migrations') is not null as migrations_table
    `;
    const ok = Boolean(database?.migrations_table);
    return Response.json(
      {
        ok,
        database: Boolean(database),
        migrations: ok,
      },
      {
        status: ok ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        database: false,
        migrations: false,
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
