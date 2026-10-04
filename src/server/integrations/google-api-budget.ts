import { DomainError } from '../../domain/core';
import { db } from '../db';

export type GoogleBillableSku = 'places_autocomplete' | 'routes_compute';

const DEFAULT_MONTHLY_HARD_CAP = 8_500;
const MAX_SAFE_CAP = 10_000;

function envName(sku: GoogleBillableSku): string {
  return sku === 'places_autocomplete'
    ? 'GOOGLE_PLACES_MONTHLY_HARD_CAP'
    : 'GOOGLE_ROUTES_MONTHLY_HARD_CAP';
}

export function googleMonthlyHardCap(
  sku: GoogleBillableSku,
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = env[envName(sku)]?.trim();
  if (!raw) return DEFAULT_MONTHLY_HARD_CAP;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SAFE_CAP) {
    throw new Error(`${envName(sku)} must be an integer between 1 and ${MAX_SAFE_CAP}`);
  }
  return value;
}

function billingMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export async function reserveGoogleApiUsage(
  sku: GoogleBillableSku,
  now = new Date(),
): Promise<{ month: string; used: number; limit: number; remaining: number }> {
  const limit = googleMonthlyHardCap(sku);
  const month = billingMonth(now);
  const [row] = await db().unsafe(
    `
      insert into google_api_usage_monthly as usage(month,sku,request_count)
      values($1,$2,1)
      on conflict(month,sku) do update
        set request_count=usage.request_count+1,updated_at=now()
        where usage.request_count < $3
      returning request_count
    `,
    [month, sku, limit],
  );

  if (!row) {
    const label = sku === 'places_autocomplete' ? 'Google Places' : 'Google Routes';
    throw new DomainError(
      sku === 'places_autocomplete'
        ? 'GOOGLE_PLACES_MONTHLY_CAP_REACHED'
        : 'GOOGLE_ROUTES_MONTHLY_CAP_REACHED',
      `${label} ถึงขีดจำกัดรายเดือน ${limit.toLocaleString('en-US')} requests แล้ว ระบบหยุดเรียก Google เพื่อป้องกันค่าใช้จ่ายเพิ่ม`,
      429,
    );
  }

  const used = Number(row.request_count);
  return { month, used, limit, remaining: Math.max(0, limit - used) };
}

export const GOOGLE_API_DEFAULT_MONTHLY_HARD_CAP = DEFAULT_MONTHLY_HARD_CAP;
