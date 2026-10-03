import test from 'node:test';
import assert from 'node:assert/strict';
import { config, resetConfigForTests } from '../src/server/config';

test('empty optional Project Master compose values normalize to undefined', () => {
  const names = [
    'APP_ENV',
    'DATABASE_URL',
    'OUTLOOK_CALENDAR_SYNC_ENABLED',
    'TEAMS_NOTIFICATIONS_ENABLED',
    'PROJECT_MASTER_TENANT_ID',
    'PROJECT_MASTER_CLIENT_ID',
    'PROJECT_MASTER_CLIENT_AUTH',
    'PROJECT_MASTER_CLIENT_PRIVATE_KEY_PATH',
    'PROJECT_MASTER_CLIENT_CERT_PATH',
    'PROJECT_MASTER_SITE_ID',
    'PROJECT_MASTER_LIST_ID',
    'PROJECT_MASTER_COLUMN_MAP',
  ] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));

  try {
    process.env.APP_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://app@example.invalid/test';
    process.env.OUTLOOK_CALENDAR_SYNC_ENABLED = 'false';
    process.env.TEAMS_NOTIFICATIONS_ENABLED = 'false';
    for (const name of names.slice(4)) process.env[name] = '';

    resetConfigForTests();
    const value = config();
    assert.equal(value.PROJECT_MASTER_TENANT_ID, undefined);
    assert.equal(value.PROJECT_MASTER_CLIENT_ID, undefined);
    assert.equal(value.PROJECT_MASTER_CLIENT_AUTH, undefined);
    assert.equal(value.PROJECT_MASTER_CLIENT_PRIVATE_KEY_PATH, undefined);
    assert.equal(value.PROJECT_MASTER_CLIENT_CERT_PATH, undefined);
    assert.equal(value.PROJECT_MASTER_SITE_ID, undefined);
    assert.equal(value.PROJECT_MASTER_LIST_ID, undefined);
    assert.equal(value.PROJECT_MASTER_COLUMN_MAP, undefined);
  } finally {
    for (const name of names) {
      const old = previous.get(name);
      if (old === undefined) delete process.env[name];
      else process.env[name] = old;
    }
    resetConfigForTests();
  }
});
