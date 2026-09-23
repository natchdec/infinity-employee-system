import postgres from 'postgres';
import { mkdir, readFile, writeFile, access, chmod } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { userInfo } from 'node:os';
import path from 'node:path';

// Isolated UAT uses Unix-domain peer authentication, not an exposed unauthenticated TCP service.
// Production continues to require independently provisioned database credentials and roles.
const root = process.cwd();
if (!root.endsWith('/Infinity Employee System') || process.env.APP_ENV === 'production')
  throw new Error('Wrong UAT target');
if (process.getuid?.() === 0) throw new Error('Use the existing non-root worker account');
const osUser = userInfo().username;
if (!/^[a-zA-Z0-9_-]+$/.test(osUser)) throw new Error('Unsupported OS identity');
const dir = path.join(root, 'data/uat');
const clusterDir = path.join(dir, 'postgres');
const socket = path.join(dir, 'socket');
await mkdir(socket, { recursive: true, mode: 0o700 });
await chmod(dir, 0o700);
await chmod(socket, 0o700);
const nativeRequire = createRequire(import.meta.resolve('embedded-postgres'));
const native = await import(
  nativeRequire.resolve(`@embedded-postgres/${process.platform}-${process.arch}`)
);
function command(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => {
      error += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`UAT native command failed (${code}): ${error.slice(-800)}`)),
    );
  });
}
try {
  await access(path.join(clusterDir, 'PG_VERSION'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await command(native.initdb, [
    '-D',
    clusterDir,
    '-U',
    'ies_uat_owner',
    '--auth-local=peer',
    '--auth-host=reject',
    '--encoding=UTF8',
    '--locale=C',
  ]);
  await writeFile(
    path.join(clusterDir, 'IES_UAT_IDENTITY'),
    'infinity-employee-system:ies_uat:54329\n',
    { flag: 'wx', mode: 0o600 },
  );
}
if (
  (await readFile(path.join(clusterDir, 'IES_UAT_IDENTITY'), 'utf8')).trim() !==
  'infinity-employee-system:ies_uat:54329'
)
  throw new Error('Refusing an unknown PostgreSQL cluster');
await writeFile(
  path.join(clusterDir, 'pg_hba.conf'),
  'local all ies_uat_owner peer map=ies_uat\nlocal all ies_uat_app peer map=ies_uat\nlocal all all reject\nhost all all 0.0.0.0/0 reject\nhost all all ::/0 reject\n',
  { mode: 0o600 },
);
await writeFile(
  path.join(clusterDir, 'pg_ident.conf'),
  `ies_uat ${osUser} ies_uat_owner\nies_uat ${osUser} ies_uat_app\n`,
  { mode: 0o600 },
);
const child = spawn(
  native.postgres,
  [
    '-D',
    clusterDir,
    '-k',
    socket,
    '-h',
    '',
    '-p',
    '54329',
    '-c',
    'shared_buffers=64MB',
    '-c',
    'max_connections=40',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let nativeError = '';
child.stderr.on('data', (chunk) => {
  nativeError = (nativeError + chunk.toString()).slice(-2000);
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
const admin = postgres({
  host: socket,
  port: 54329,
  database: 'postgres',
  username: 'ies_uat_owner',
  max: 1,
  connect_timeout: 2,
  onnotice: () => {},
});
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    await admin`select 1`;
    ready = true;
    break;
  } catch {
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
if (!ready) {
  child.kill('SIGTERM');
  throw new Error('UAT PostgreSQL did not start: ' + nativeError);
}
const postmasterState = (await readFile(path.join(clusterDir, 'postmaster.pid'), 'utf8'))
  .trimEnd()
  .split('\n');
if (Number(postmasterState[0]) !== child.pid || postmasterState[7] !== 'ready') {
  child.kill('SIGTERM');
  throw new Error('UAT PostgreSQL readiness came from an unexpected instance');
}
try {
  if (!(await admin`select 1 from pg_roles where rolname='ies_uat_app'`).length)
    await admin.unsafe('CREATE ROLE ies_uat_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
  if (!(await admin`select 1 from pg_database where datname='ies_uat'`).length)
    await admin.unsafe('CREATE DATABASE ies_uat OWNER ies_uat_owner');
  const version = (await admin`select version() as version`)[0].version;
  const connection = (user) =>
    `postgres://${user}@localhost:54329/ies_uat?host=${encodeURIComponent(socket)}`;
  await writeFile(
    path.join(dir, 'runtime.env'),
    [
      'APP_ENV=uat',
      'APP_ORIGIN=http://127.0.0.1:4311',
      `DATABASE_URL=${connection('ies_uat_app')}`,
      `MIGRATION_DATABASE_URL=${connection('ies_uat_owner')}`,
      'STORAGE_DRIVER=filesystem',
      `STORAGE_ROOT=${path.join(dir, 'documents')}`,
      'UAT_SEED_ALLOWED=true',
    ].join('\n') + '\n',
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      event: 'uat_postgres_ready',
      database: 'ies_uat',
      transport: 'private Unix socket',
      tcpListening: false,
      role: 'ies_uat_app',
      version,
    }),
  );
} finally {
  await admin.end();
}

const mode = process.argv[2] ?? 'serve';
if (mode !== 'serve' && mode !== '--run-transaction') {
  child.kill('SIGTERM');
  throw new Error('Unsupported UAT PostgreSQL mode');
}

if (mode === '--run-transaction') {
  const runtimeEnv = {
    ...process.env,
    APP_ENV: 'uat',
    APP_ORIGIN: 'http://127.0.0.1:4311',
    DATABASE_URL: connection('ies_uat_app'),
    MIGRATION_DATABASE_URL: connection('ies_uat_owner'),
    STORAGE_DRIVER: 'filesystem',
    STORAGE_ROOT: path.join(dir, 'documents'),
    UAT_SEED_ALLOWED: 'true',
  };
  const check = spawn('/usr/local/bin/pnpm', ['exec', 'tsx', 'scripts/transaction-uat.ts'], {
    cwd: root,
    env: runtimeEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let checkOut = '';
  let checkErr = '';
  check.stdout.on('data', (chunk) => {
    checkOut += chunk.toString();
  });
  check.stderr.on('data', (chunk) => {
    checkErr += chunk.toString();
  });
  const checkCode = await new Promise((resolve, reject) => {
    check.on('error', reject);
    check.on('exit', (code) => resolve(code ?? 1));
  });
  if (checkOut) process.stdout.write(checkOut);
  if (checkErr) process.stderr.write(checkErr);
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  if (checkCode !== 0) process.exitCode = checkCode;
} else {
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      if (!stopping) {
        stopping = true;
        child.kill('SIGTERM');
      }
    });
  child.on('exit', (code) => {
    console.log(JSON.stringify({ event: 'uat_postgres_stopped', code, persistent: true }));
    process.exitCode = code ?? 1;
  });
}
