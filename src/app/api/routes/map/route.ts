import { z } from 'zod';
import { invariant } from '@/domain/core';
import { apiActor, apiError } from '@/server/api';
import { config } from '@/server/config';
import { reserveGoogleApiUsage } from '@/server/integrations/google-api-budget';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    encodedPolyline: z.string().min(3).max(20_000),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const actor = await apiActor(request);
    invariant(actor.active, 'FORBIDDEN', 'บัญชีพนักงานไม่พร้อมใช้งาน', 403);
    const input = bodySchema.parse(await request.json());
    const key = config().GOOGLE_ROUTES_API_KEY;
    invariant(
      key,
      'GOOGLE_STATIC_MAP_NOT_CONFIGURED',
      'ยังไม่ได้ตั้งค่า Google Maps สำหรับแสดงแผนที่',
      503,
    );

    await reserveGoogleApiUsage('maps_static');

    const url = new URL('https://maps.googleapis.com/maps/api/staticmap');
    url.searchParams.set('size', '640x320');
    url.searchParams.set('scale', '2');
    url.searchParams.set('maptype', 'roadmap');
    url.searchParams.set('path', `weight:5|color:0xe84a0cff|enc:${input.encodedPolyline}`);
    url.searchParams.set('key', key);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    invariant(
      response.ok,
      'GOOGLE_STATIC_MAP_UNAVAILABLE',
      'โหลดพื้นหลัง Google Map ไม่สำเร็จ กรุณาลองใหม่',
      503,
    );

    const contentType = response.headers.get('content-type') ?? '';
    invariant(
      contentType.startsWith('image/'),
      'GOOGLE_STATIC_MAP_RESPONSE_INVALID',
      'Google Maps ส่งข้อมูลแผนที่ไม่ถูกต้อง',
      503,
    );

    return new Response(await response.arrayBuffer(), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
