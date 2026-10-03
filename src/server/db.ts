import { type Sql, type TransactionSql } from 'postgres';
import { connectDatabase } from './connection';
import { config } from './config';
import { fingerprint, invariant, jsonValue, type Actor, type Json } from '../domain/core';
import { parsePolicy, type PolicyFamily, type VersionedPolicy } from '../domain/policy';
export type Transaction = TransactionSql;
const globalDatabase = globalThis as unknown as { employeeDatabase?: Sql };
export function db(): Sql {
  if (!globalDatabase.employeeDatabase)
    globalDatabase.employeeDatabase = connectDatabase(config().DATABASE_URL);
  return globalDatabase.employeeDatabase;
}
export async function closeDb(): Promise<void> {
  await globalDatabase.employeeDatabase?.end();
  delete globalDatabase.employeeDatabase;
}
export async function command<T extends Json>(
  actor: Actor,
  scope: string,
  key: string,
  input: unknown,
  perform: (tx: Transaction) => Promise<T>,
): Promise<T> {
  invariant(actor.active, 'FORBIDDEN', 'บัญชีพนักงานไม่พร้อมใช้งาน', 403);
  invariant(
    /^[A-Za-z0-9_.:-]{8,160}$/.test(key),
    'IDEMPOTENCY_KEY_REQUIRED',
    'ต้องมีรหัสการทำรายการที่ถูกต้อง',
    400,
  );
  const hash = fingerprint(input);
  const result = await db().begin(async (tx) => {
    const inserted =
      await tx`insert into command_receipts(actor_id,scope,key,input_hash) values(${actor.id},${scope},${key},${hash}) on conflict do nothing returning actor_id`;
    if (!inserted.length) {
      const [receipt] =
        await tx`select input_hash,result from command_receipts where actor_id=${actor.id} and scope=${scope} and key=${key} for update`;
      invariant(
        receipt && receipt.input_hash === hash,
        'IDEMPOTENCY_CONFLICT',
        'รหัสการทำรายการเดิมถูกใช้กับข้อมูลที่ต่างกัน',
        409,
      );
      invariant(
        receipt.result !== null,
        'COMMAND_OUTCOME_UNKNOWN',
        'ต้องตรวจสอบผลรายการเดิมก่อนส่งซ้ำ',
        409,
      );
      return receipt.result as T;
    }
    const value = await perform(tx);
    await tx`update command_receipts set result=${tx.json(value)} where actor_id=${actor.id} and scope=${scope} and key=${key}`;
    return value;
  });
  return result as T;
}
export async function audit(
  tx: Transaction,
  actor: Actor | null,
  action: string,
  entityType: string,
  entityId: string,
  revision: number | null,
  metadata: Json,
  correlationId: string,
): Promise<void> {
  await tx`insert into audit_events(actor_id,action,entity_type,entity_id,revision,metadata,correlation_id) values(${actor?.id ?? null},${action},${entityType},${entityId},${revision},${tx.json(metadata)},${correlationId})`;
}
export async function enqueue(
  tx: Transaction,
  kind: string,
  dedupeKey: string,
  payload: Json,
): Promise<void> {
  await tx`insert into jobs(kind,dedupe_key,payload) values(${kind},${dedupeKey},${tx.json(payload)}) on conflict(dedupe_key) do nothing`;
}
export async function policyFor<T>(
  tx: Transaction | Sql,
  family: PolicyFamily,
  date: string,
): Promise<VersionedPolicy<T>> {
  const [row] =
    await tx`select id,family,version,effective_from::text,status,body,body_hash from policy_versions where family=${family} and status='published' and effective_from<=${date}::date order by effective_from desc limit 1`;
  invariant(row, 'POLICY_NOT_CONFIGURED', `ยังไม่มีนโยบาย ${family} ที่มีผลสำหรับวันที่นี้`);
  const body = parsePolicy(family, row.body) as T;
  invariant(
    fingerprint(body) === row.body_hash,
    'POLICY_INTEGRITY',
    'ข้อมูลนโยบายไม่ตรงกับหลักฐานที่บันทึกไว้',
    500,
  );
  return {
    id: row.id,
    family,
    version: row.version,
    effectiveFrom: row.effective_from,
    status: 'published',
    body,
    hash: row.body_hash,
  };
}
export function safeJson(value: unknown): Json {
  // PostgreSQL timestamps arrive as Date instances; JSON serialization makes their UTC representation explicit.
  return jsonValue(
    JSON.parse(
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === 'bigint' ? item.toString() : item,
      ),
    ),
  );
}
