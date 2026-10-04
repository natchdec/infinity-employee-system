import { z } from 'zod';
import { fingerprint, invariant, type Actor } from '../../domain/core';
import { config, type AppConfig } from '../config';
import { db } from '../db';
import { reserveGoogleApiUsage } from './google-api-budget';

const waypointSchema = z
  .object({
    address: z.string().trim().min(3).max(500).optional(),
    placeId: z.string().trim().min(3).max(300).optional(),
  })
  .strict()
  .refine((value) => Number(Boolean(value.address)) + Number(Boolean(value.placeId)) === 1);

const quoteInputSchema = z
  .object({
    originKind: z.enum(['home', 'office', 'customer', 'other']),
    destinationKind: z.enum(['home', 'office', 'customer', 'other']),
    originLabel: z.string().trim().min(1).max(200),
    destinationLabel: z.string().trim().min(1).max(200),
    origin: waypointSchema,
    destination: waypointSchema,
  })
  .strict();

function googleWaypoint(value: z.infer<typeof waypointSchema>) {
  return value.placeId ? { placeId: value.placeId } : { address: value.address };
}

function durationSeconds(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?s$/.test(value)) return null;
  const seconds = Math.round(Number(value.slice(0, -1)));
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
}

async function requestGoogleRoute(
  c: AppConfig,
  input: z.infer<typeof quoteInputSchema>,
): Promise<{ distanceMetres: number; durationSeconds: number | null }> {
  invariant(
    c.GOOGLE_ROUTES_API_KEY,
    'GOOGLE_ROUTES_NOT_CONFIGURED',
    'ยังไม่ได้ตั้งค่า Google Routes',
    503,
  );
  await reserveGoogleApiUsage('routes_compute');
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': c.GOOGLE_ROUTES_API_KEY,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify({
      origin: googleWaypoint(input.origin),
      destination: googleWaypoint(input.destination),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      units: 'METRIC',
    }),
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  invariant(
    response.ok,
    'GOOGLE_ROUTES_UNAVAILABLE',
    'Google Routes ไม่พร้อมใช้งาน กรุณาลองใหม่',
    503,
  );
  const payload = (await response.json()) as {
    routes?: Array<{ distanceMeters?: unknown; duration?: unknown }>;
  };
  const route = payload.routes?.[0];
  invariant(
    route,
    'GOOGLE_ROUTES_NO_ROUTE',
    'Google Maps หาเส้นทางไม่เจอ กรุณาระบุชื่อสถานที่พร้อมที่อยู่ให้ละเอียดขึ้น',
    422,
  );
  const distanceMetres = Number(route.distanceMeters);
  invariant(
    Number.isSafeInteger(distanceMetres) && distanceMetres > 0 && distanceMetres <= 3_000_000,
    'GOOGLE_ROUTES_RESPONSE_INVALID',
    'ผลระยะทางจาก Google Routes ไม่ถูกต้อง',
    503,
  );
  return {
    distanceMetres,
    durationSeconds: durationSeconds(route.duration),
  };
}

/**
 * Standard Google Maps Platform terms do not grant this application a right to
 * retain Routes API distance/duration as permanent financial evidence. This
 * endpoint therefore returns a no-store, transient preview only. It must not be
 * converted into a provider-verified claim or persisted by the application.
 */
export async function createGoogleRoutePreview(actor: Actor, raw: unknown) {
  invariant(actor.active, 'FORBIDDEN', 'บัญชีพนักงานไม่พร้อมใช้งาน', 403);
  const input = quoteInputSchema.parse(raw);
  const result = await requestGoogleRoute(config(), input);
  return {
    provider: 'google_routes' as const,
    usage: 'transient_preview' as const,
    persistable: false as const,
    canSubmitAsProviderEvidence: false as const,
    attribution: 'Google Maps',
    ...result,
  };
}

export async function createGoogleRouteQuote(actor: Actor, raw: unknown, now = new Date()) {
  invariant(actor.active, 'FORBIDDEN', 'บัญชีพนักงานไม่พร้อมใช้งาน', 403);
  const c = config();
  invariant(
    c.GOOGLE_ROUTES_RETENTION_CONFIRMED,
    'GOOGLE_ROUTES_RETENTION_NOT_CONFIRMED',
    'ยังไม่ยืนยันสิทธิ์การเก็บหลักฐานระยะทางจากผู้ให้บริการ',
    503,
  );
  const input = quoteInputSchema.parse(raw);
  const { distanceMetres, durationSeconds: duration } = await requestGoogleRoute(c, input);
  const evidence = { distanceMetres, durationSeconds: duration, travelMode: 'DRIVE' };
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const [row] = await db()`
    insert into route_quotes(
      employee_id,provider,origin_kind,destination_kind,origin_label,destination_label,
      distance_metres,duration_seconds,provider_response_hash,retention_confirmed,expires_at
    ) values(
      ${actor.id},'google_routes',${input.originKind},${input.destinationKind},
      ${input.originLabel},${input.destinationLabel},${distanceMetres},${duration},
      ${fingerprint(evidence)},true,${expiresAt}
    )
    returning id
  `;
  invariant(row, 'GOOGLE_ROUTES_QUOTE_NOT_SAVED', 'บันทึก route quote ไม่สำเร็จ', 500);
  return {
    provider: 'google_routes' as const,
    providerReference: row.id as string,
    distanceMetres,
    durationSeconds: duration,
    expiresAt: expiresAt.toISOString(),
  };
}

export function googleRoutesPreviewConfigured(): boolean {
  return Boolean(config().GOOGLE_ROUTES_API_KEY);
}

export function googleRoutesConfigured(): boolean {
  const c = config();
  return Boolean(c.GOOGLE_ROUTES_API_KEY && c.GOOGLE_ROUTES_RETENTION_CONFIRMED);
}
