import type { Json } from '@/domain/core';
import type { RequestKind } from '@/domain/requests';
import type { RequestFormOptions } from '@/server/request-view';

export function textValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function kmToMetres(value: string): number {
  if (!/^(0|[1-9]\d{0,4})(\.\d{1,3})?$/.test(value)) return Number.NaN;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

export function buildRequestInput(
  kind: RequestKind,
  data: FormData,
  options: RequestFormOptions,
  documentIds: string[],
): Record<string, unknown> {
  const value = (name: string) => textValue(data.get(name));
  const projectId = value('projectId') || null;
  const common = {
    title: value('title'),
    projectId,
    description: value('description'),
  };
  if (kind === 'leave') {
    return {
      ...common,
      kind,
      typeId: value('typeId'),
      start: value('start'),
      end: value('end'),
      unit: 'full_day',
      ...(value('eventReference') ? { eventReference: value('eventReference') } : {}),
      documentIds,
    };
  }
  if (kind === 'ot') {
    return {
      ...common,
      kind,
      date: value('date'),
      task: value('task'),
      lines: options.otCategories
        .map((item) => ({
          categoryId: item.id,
          hours: Number(value(`ot_${item.id}`) || '0'),
        }))
        .filter((line) => Number.isInteger(line.hours) && line.hours > 0),
    };
  }
  if (kind === 'expense') {
    const categoryId = value('categoryId');
    const line: Record<string, unknown> = {
      categoryId,
      date: value('date'),
      description: value('lineDescription'),
      documentIds,
    };
    if (categoryId === 'mileage') {
      line.mileage = [
        {
          origin: value('leg1Origin'),
          destination: value('leg1Destination'),
          originLabel: value('leg1OriginLabel'),
          destinationLabel: value('leg1DestinationLabel'),
          distanceMetres: kmToMetres(value('leg1Km')),
          source: 'manual_attested',
        },
        ...(value('leg2Km')
          ? [
              {
                origin: value('leg2Origin'),
                destination: value('leg2Destination'),
                originLabel: value('leg2OriginLabel'),
                destinationLabel: value('leg2DestinationLabel'),
                distanceMetres: kmToMetres(value('leg2Km')),
                source: 'manual_attested',
              },
            ]
          : []),
      ];
    } else {
      line.amount = value('amount');
    }
    if (categoryId === 'entertainment') {
      line.entertainment = {
        purpose: value('purpose'),
        customer: value('customer'),
        attendeeCount: Number(value('attendeeCount')),
        attendeeContext: value('attendeeContext'),
      };
    }
    return {
      ...common,
      kind,
      parentTripId: value('parentTripId') || null,
      lines: [line],
    };
  }
  if (kind === 'trip') {
    return {
      ...common,
      kind,
      start: value('start'),
      end: value('end'),
      destination: value('destination'),
      region: value('region'),
      requestPerDiem: data.get('requestPerDiem') === 'on',
      estimatedAmount: value('estimatedAmount') || '0',
      currency: 'THB',
    };
  }
  return {
    ...common,
    kind: 'advance',
    projectId: null,
    parentTripId: value('parentTripId'),
    date: value('date'),
    amount: value('amount'),
  };
}

export function initialDocumentIds(kind: RequestKind, initial: Record<string, Json>): string[] {
  const source =
    kind === 'leave'
      ? arrayValue(initial.documentIds)
      : arrayValue(objectValue(arrayValue(initial.lines)[0]).documentIds);
  return source.filter((value): value is string => typeof value === 'string');
}
