import { createHash } from 'node:crypto';

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function invariant(
  condition: unknown,
  code: string,
  message: string,
  status = 422,
): asserts condition {
  if (!condition) throw new DomainError(code, message, status);
}

export const MAX_MONEY = 999_999_999_99n;

/** Parse decimal THB to integer satang. No floating point, exponent or implicit rounding. */
export function money(value: string): bigint {
  invariant(
    typeof value === 'string' && /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(value),
    'INVALID_MONEY',
    'ระบุจำนวนเงินเป็นตัวเลขไม่เกินสองตำแหน่งทศนิยม',
  );
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  invariant(result <= MAX_MONEY, 'MONEY_LIMIT', 'จำนวนเงินเกินขอบเขตที่ระบบรองรับ');
  return result;
}

export function formatMoney(value: bigint | string): string {
  const amount = typeof value === 'bigint' ? value : BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}${(absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

/** Nonnegative rational calculation, rounded half up exactly once at the line boundary. */
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  invariant(numerator >= 0n && denominator > 0n, 'INVALID_RATIO', 'ค่าคำนวณไม่ถูกต้อง');
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function integer(
  value: unknown,
  min: number,
  max: number,
  code = 'INTEGER_REQUIRED',
): number {
  invariant(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max,
    code,
    `ระบุจำนวนเต็มระหว่าง ${min} ถึง ${max}`,
  );
  return value;
}

export function metres(value: string): number {
  invariant(
    typeof value === 'string' && /^(0|[1-9]\d{0,4})(\.\d{1,3})?$/.test(value),
    'INVALID_DISTANCE',
    'ระบุระยะทางเป็นกิโลเมตรไม่เกินสามตำแหน่งทศนิยม',
  );
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function canonical(value: unknown): string {
  if (value instanceof Date) {
    invariant(Number.isFinite(value.getTime()), 'INVALID_JSON', 'Invalid timestamp');
    return JSON.stringify(value.toISOString());
  }
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), 'INVALID_JSON', 'ข้อมูลตัวเลขไม่ถูกต้อง');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  invariant(
    typeof value === 'object' &&
      value !== null &&
      Object.getPrototypeOf(value) === Object.prototype,
    'INVALID_JSON',
    'รูปแบบข้อมูลไม่ถูกต้อง',
  );
  return `{${Object.keys(value)
    .sort()
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function jsonValue(value: unknown): Json {
  return JSON.parse(canonical(value)) as Json;
}

export function safeCsvCell(value: unknown): string {
  let text = String(value ?? '').replace(/\u0000/g, '');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csv(rows: readonly (readonly unknown[])[]): string {
  return '\uFEFF' + rows.map((row) => row.map(safeCsvCell).join(',')).join('\r\n') + '\r\n';
}

export type Role = 'employee' | 'head' | 'finance' | 'finance_payer' | 'admin';
export interface Actor {
  id: string;
  displayName: string;
  email: string;
  roles: Role[];
  isHeadOwner: boolean;
  active: boolean;
}

export function requireRole(actor: Actor, ...roles: Role[]): void {
  invariant(
    actor.active && roles.some((role) => actor.roles.includes(role)),
    'FORBIDDEN',
    'คุณไม่มีสิทธิ์ดำเนินการนี้',
    403,
  );
}

export function requireIndependentFinance(actor: Actor, ownerId: string): void {
  requireRole(actor, 'finance');
  invariant(
    actor.id !== ownerId,
    'FINANCE_CONFLICT_OF_INTEREST',
    'ให้ผู้มีสิทธิ์การเงินอีกคนตรวจสอบหรือบันทึกการจ่ายรายการของคุณ',
    403,
  );
}

export function requireIndependentPayer(actor: Actor, ownerId: string, verifiedById: string): void {
  requireRole(actor, 'finance_payer');
  invariant(
    actor.id !== ownerId,
    'FINANCE_CONFLICT_OF_INTEREST',
    'ให้ผู้มีสิทธิ์การเงินอีกคนบันทึกการจ่ายรายการของคุณ',
    403,
  );
  invariant(
    actor.id !== verifiedById,
    'PAYMENT_VERIFIER_CONFLICT',
    'ผู้ยืนยัน Paid ต้องเป็นคนละคนกับ Finance Verifier ของรายการ',
    403,
  );
}

export function requireRevision(actual: number, expected: number): void {
  invariant(
    Number.isSafeInteger(expected) && actual === expected,
    'REVISION_CONFLICT',
    'รายการนี้มีการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุด',
    409,
  );
}
