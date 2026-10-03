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

function formStrings(data: FormData, name: string): string[] {
  return data
    .getAll(name)
    .filter((value): value is string => typeof value === 'string')
    .filter(Boolean);
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
        .filter(
          (line) =>
            Number.isFinite(line.hours) && line.hours >= 0.5 && Number.isInteger(line.hours * 2),
        ),
    };
  }
  if (kind === 'expense') {
    const configuredCount = Number(value('expenseLineCount') || '1');
    const lineCount =
      Number.isInteger(configuredCount) && configuredCount >= 1 && configuredCount <= 50
        ? configuredCount
        : 1;
    const legacy = !value('expenseLineCount');
    const lines = Array.from({ length: lineCount }, (_, offset) => offset + 1).map((index) => {
      const prefix = `expenseLine${index}`;
      const pick = (field: string, legacyName: string) =>
        value(`${prefix}${field}`) || (legacy && index === 1 ? value(legacyName) : '');
      const categoryId = pick('CategoryId', 'categoryId');
      const line: Record<string, unknown> = {
        categoryId,
        date: pick('Date', 'date'),
        description: pick('Description', 'lineDescription'),
        documentIds: legacy && index === 1 ? documentIds : formStrings(data, `${prefix}DocumentId`),
      };
      if (categoryId === 'mileage') {
        const requestedLegCount = Number(pick('MileageLegCount', 'mileageLegCount') || '2');
        const legCount =
          Number.isInteger(requestedLegCount) && requestedLegCount >= 1 && requestedLegCount <= 20
            ? requestedLegCount
            : 2;
        line.mileage = Array.from({ length: legCount }, (_, legOffset) => legOffset + 1).flatMap(
          (legIndex) => {
            const kilometres = pick(`Leg${legIndex}Km`, `leg${legIndex}Km`);
            if (!kilometres) return [];
            return [
              {
                origin: pick(`Leg${legIndex}Origin`, `leg${legIndex}Origin`),
                destination: pick(`Leg${legIndex}Destination`, `leg${legIndex}Destination`),
                originLabel: pick(`Leg${legIndex}OriginLabel`, `leg${legIndex}OriginLabel`),
                destinationLabel: pick(
                  `Leg${legIndex}DestinationLabel`,
                  `leg${legIndex}DestinationLabel`,
                ),
                distanceMetres: kmToMetres(kilometres),
                source: 'manual_attested',
              },
            ];
          },
        );
      } else {
        line.amount = pick('Amount', 'amount');
      }
      if (categoryId === 'entertainment') {
        line.entertainment = {
          purpose: pick('Purpose', 'purpose'),
          customer: pick('Customer', 'customer'),
          attendeeCount: Number(pick('AttendeeCount', 'attendeeCount')),
          attendeeContext: pick('AttendeeContext', 'attendeeContext'),
        };
      }
      return line;
    });
    return {
      ...common,
      kind,
      parentTripId: value('parentTripId') || null,
      lines,
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
      : kind === 'expense'
        ? arrayValue(initial.lines).flatMap((line) => arrayValue(objectValue(line).documentIds))
        : [];
  return [...new Set(source.filter((value): value is string => typeof value === 'string'))];
}
