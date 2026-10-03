import { z } from 'zod';
import { DomainError, invariant } from '../../domain/core';

const inputSchema = z
  .object({
    input: z.string().trim().min(3).max(200),
  })
  .strict();

interface PlacePrediction {
  place?: string;
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
}

export interface PlaceSuggestion {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

function placesKey(): string {
  const key = (process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_ROUTES_API_KEY ?? '').trim();
  invariant(key, 'GOOGLE_PLACES_NOT_CONFIGURED', 'Google Places ยังไม่ได้ตั้งค่า API key', 503);
  return key;
}

export async function autocompletePlaces(raw: unknown): Promise<PlaceSuggestion[]> {
  const input = inputSchema.parse(raw);
  let response: Response;
  try {
    response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': placesKey(),
      },
      body: JSON.stringify({
        input: input.input,
        includedRegionCodes: ['th'],
        languageCode: 'th',
        regionCode: 'TH',
      }),
      cache: 'no-store',
    });
  } catch {
    throw new DomainError('GOOGLE_PLACES_UNAVAILABLE', 'เชื่อมต่อ Google Places ไม่สำเร็จ', 503);
  }

  if (!response.ok) {
    let message = '';
    try {
      const body = (await response.json()) as { error?: { status?: string; message?: string } };
      message = body.error?.message ?? '';
    } catch {
      message = '';
    }
    if (
      response.status === 403 &&
      /Places API \(New\).*disabled|has not been used/i.test(message)
    ) {
      throw new DomainError(
        'GOOGLE_PLACES_NOT_ENABLED',
        'Google Places API (New) ยังไม่ได้ Enable ใน Google Cloud project',
        503,
      );
    }
    throw new DomainError(
      response.status === 401 || response.status === 403
        ? 'GOOGLE_PLACES_FORBIDDEN'
        : 'GOOGLE_PLACES_FAILED',
      `Google Places ตอบ HTTP ${response.status}`,
      503,
    );
  }

  const body = (await response.json()) as {
    suggestions?: { placePrediction?: PlacePrediction }[];
  };
  return (body.suggestions ?? []).flatMap((item) => {
    const prediction = item.placePrediction;
    const text = prediction?.text?.text?.trim();
    const placeId =
      prediction?.placeId?.trim() ?? prediction?.place?.replace(/^places\//, '').trim();
    if (!prediction || !text || !placeId) return [];
    return [
      {
        placeId,
        text,
        mainText: prediction.structuredFormat?.mainText?.text?.trim() ?? text,
        secondaryText: prediction.structuredFormat?.secondaryText?.text?.trim() ?? '',
      },
    ];
  });
}
