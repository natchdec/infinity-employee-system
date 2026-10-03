import { connectDatabase } from '../src/server/connection';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
if (!migrationUrl || !appUrl)
  throw new Error('Migration and application database connections must be configured separately');
const target = new URL(migrationUrl);
const application = new URL(appUrl);
const role = decodeURIComponent(application.username);
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role))
  throw new Error('Unsupported application role identifier');
if (
  target.pathname !== application.pathname ||
  target.hostname !== application.hostname ||
  target.port !== application.port ||
  target.searchParams.get('host') !== application.searchParams.get('host')
)
  throw new Error('Migration and application targets differ');
if (target.username === application.username)
  throw new Error('Migration owner must not be the application login role');
const sql = connectDatabase(migrationUrl, {
  max: 1,
  applicationName: 'infinity-employee-migrator',
});
try {
  await sql`create table if not exists schema_migrations(name text primary key, sha256 char(64) not null, applied_at timestamptz not null default now())`;
  const names = (await readdir(path.join(process.cwd(), 'migrations')))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(1709232026)`;
    const existing = await tx`select name,sha256 from schema_migrations order by name`;
    for (const old of existing)
      if (!names.includes(old.name))
        throw new Error('Applied migration is missing from the source artifact');
    for (const name of names) {
      const content = await readFile(path.join(process.cwd(), 'migrations', name), 'utf8');
      const digest = createHash('sha256').update(content).digest('hex');
      const old = existing.find((row) => row.name === name);
      if (old) {
        if (old.sha256 !== digest) throw new Error(`Applied migration checksum changed: ${name}`);
        continue;
      }
      await tx.unsafe(content);
      await tx`insert into schema_migrations(name,sha256) values(${name},${digest})`;
      applied.push(name);
    }
    await tx.unsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await tx.unsafe(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`,
    );
    await tx.unsafe(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
    await tx.unsafe(`REVOKE INSERT,UPDATE,DELETE ON schema_migrations FROM "${role}"`);
  });
  console.log(
    JSON.stringify({
      event: 'migrations_complete',
      database: target.pathname.slice(1),
      applied,
      total: names.length,
      checksumVerified: true,
      applicationRole: role,
    }),
  );
} finally {
  await sql.end();
}
