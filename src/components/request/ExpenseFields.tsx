'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import type { Json } from '@/domain/core';
import { AddressAutocompleteInput } from '@/components/AddressAutocompleteInput';
import type { RequestFormOptions } from '@/server/request-view';
import { DocumentUploader, type UploadedDocument } from './DocumentUploader';
import { arrayValue, objectValue, textValue } from './form-utils';

interface Props {
  csrf: string;
  options: RequestFormOptions;
  initial: Record<string, Json>;
}

interface EditorLine {
  key: string;
  initial: Record<string, unknown>;
  documents: UploadedDocument[];
}

interface RoutePreviewState {
  busy: boolean;
  message?: string;
  error?: string;
}

function initialDocuments(line: Record<string, unknown>): UploadedDocument[] {
  return arrayValue(line.documentIds).flatMap((value, index) =>
    typeof value === 'string' ? [{ id: value, name: `หลักฐานเดิม ${index + 1}` }] : [],
  );
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function uploadedWhen(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
  }).format(new Date(value));
}

function metresToKm(value: number): string {
  return (value / 1000).toFixed(3).replace(/\\.?0+$/, '');
}

function durationLabel(seconds: number | null | undefined): string {
  if (!Number.isFinite(seconds) || seconds === null || seconds === undefined) return '';
  return ` · ประมาณ ${Math.max(1, Math.round(seconds / 60))} นาที`;
}

export function ExpenseFields({ csrf, options, initial }: Props) {
  const initialLines = arrayValue(initial.lines).map(objectValue);
  const nextKey = useRef(initialLines.length);
  const [lines, setLines] = useState<EditorLine[]>(() => {
    const source = initialLines.length ? initialLines : [{}];
    return source.map((line, index) => ({
      key: `line-${index}`,
      initial: line,
      documents: initialDocuments(line),
    }));
  });

  const selectedDocumentIds = new Set(lines.flatMap((line) => line.documents.map((doc) => doc.id)));

  function updateDocuments(key: string, documents: UploadedDocument[]) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, documents } : line)),
    );
  }

  function addLine() {
    setLines((current) => {
      if (current.length >= 50) return current;
      const key = `new-${nextKey.current}`;
      nextKey.current += 1;
      return [...current, { key, initial: {}, documents: [] }];
    });
  }

  function removeLine(key: string) {
    setLines((current) =>
      current.length <= 1 ? current : current.filter((line) => line.key !== key),
    );
  }

  return (
    <>
      <fieldset>
        <legend>Expense Request</legend>
        <label>
          <span>ทริปที่เกี่ยวข้อง</span>
          <select name="parentTripId" defaultValue={textValue(initial.parentTripId)}>
            <option value="">ไม่ผูกทริป</option>
            {options.approvedTrips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.reference} — {trip.title}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="expenseLineCount" value={lines.length} />
        <div className="expense-lines-toolbar">
          <div>
            <strong>{lines.length} รายการ</strong>
            <p className="field-note">
              แยก Mileage, Toll, Parking, Grab, Fuel และค่าใช้จ่ายอื่นเป็นคนละรายการ
            </p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            disabled={lines.length >= 50}
            onClick={addLine}
          >
            เพิ่มรายการค่าใช้จ่าย
          </button>
        </div>
      </fieldset>

      {lines.map((line, index) => (
        <ExpenseLineCard
          key={line.key}
          csrf={csrf}
          index={index}
          initial={line.initial}
          documents={line.documents}
          options={options}
          selectedDocumentIds={selectedDocumentIds}
          canRemove={lines.length > 1}
          onDocumentsChange={(documents) => updateDocuments(line.key, documents)}
          onRemove={() => removeLine(line.key)}
        />
      ))}
    </>
  );
}

interface ExpenseLineCardProps {
  csrf: string;
  index: number;
  initial: Record<string, unknown>;
  documents: UploadedDocument[];
  options: RequestFormOptions;
  selectedDocumentIds: Set<string>;
  canRemove: boolean;
  onDocumentsChange: (documents: UploadedDocument[]) => void;
  onRemove: () => void;
}

function ExpenseLineCard({
  csrf,
  index,
  initial,
  documents,
  options,
  selectedDocumentIds,
  canRemove,
  onDocumentsChange,
  onRemove,
}: ExpenseLineCardProps) {
  const prefix = `expenseLine${index + 1}`;
  const mileage = arrayValue(initial.mileage).map(objectValue);
  const entertainment = objectValue(initial.entertainment);
  const [category, setCategory] = useState(
    textValue(initial.categoryId) || options.expenseCategories[0]?.id || 'mileage',
  );
  const [mileageLegCount, setMileageLegCount] = useState(
    Math.min(20, Math.max(2, mileage.length || 2)),
  );
  const [routePreviews, setRoutePreviews] = useState<Record<number, RoutePreviewState>>({});
  const categoryPolicy = options.expenseCategories.find((item) => item.id === category);
  const evidenceRequired = categoryPolicy?.evidenceRequired ?? false;

  function formField(name: string): HTMLInputElement | HTMLSelectElement | null {
    const form = document.querySelector<HTMLFormElement>('form.request-form');
    const field = form?.elements.namedItem(name);
    return field instanceof HTMLInputElement || field instanceof HTMLSelectElement ? field : null;
  }

  async function previewMileageLeg(legIndex: number) {
    const originKind = formField(`${prefix}Leg${legIndex}Origin`)?.value.trim() ?? '';
    const destinationKind = formField(`${prefix}Leg${legIndex}Destination`)?.value.trim() ?? '';
    const originAddress = formField(`${prefix}Leg${legIndex}OriginLabel`)?.value.trim() ?? '';
    const destinationAddress =
      formField(`${prefix}Leg${legIndex}DestinationLabel`)?.value.trim() ?? '';
    const originPlaceId = formField(`${prefix}Leg${legIndex}OriginPlaceId`)?.value.trim() ?? '';
    const destinationPlaceId =
      formField(`${prefix}Leg${legIndex}DestinationPlaceId`)?.value.trim() ?? '';

    if (originAddress.length < 3 || destinationAddress.length < 3) {
      setRoutePreviews((current) => ({
        ...current,
        [legIndex]: {
          busy: false,
          error: 'กรอกต้นทางและปลายทางให้ละเอียดพอสำหรับ Google Maps ก่อนคำนวณ',
        },
      }));
      return;
    }

    setRoutePreviews((current) => ({ ...current, [legIndex]: { busy: true } }));
    try {
      const response = await fetch('/api/routes/preview', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          originKind,
          destinationKind,
          originLabel: originAddress,
          destinationLabel: destinationAddress,
          origin: originPlaceId ? { placeId: originPlaceId } : { address: originAddress },
          destination: destinationPlaceId
            ? { placeId: destinationPlaceId }
            : { address: destinationAddress },
        }),
      });
      const result = (await response.json()) as {
        preview?: { distanceMetres?: unknown; durationSeconds?: unknown };
        error?: { message?: unknown };
      };
      if (!response.ok) {
        throw new Error(
          typeof result.error?.message === 'string'
            ? result.error.message
            : 'Google Maps คำนวณเส้นทางไม่สำเร็จ',
        );
      }
      const distanceMetres = Number(result.preview?.distanceMetres);
      const durationSeconds =
        result.preview?.durationSeconds === null ? null : Number(result.preview?.durationSeconds);
      if (!Number.isSafeInteger(distanceMetres) || distanceMetres <= 0) {
        throw new Error('ผลระยะทางจาก Google Maps ไม่ถูกต้อง');
      }
      const distanceField = formField(`${prefix}Leg${legIndex}Km`);
      if (!(distanceField instanceof HTMLInputElement)) {
        throw new Error('ไม่พบช่องระยะทางสำหรับเที่ยวนี้');
      }
      distanceField.value = metresToKm(distanceMetres);
      setRoutePreviews((current) => ({
        ...current,
        [legIndex]: {
          busy: false,
          message: `Google Maps: ${metresToKm(distanceMetres)} กม.${durationLabel(
            Number.isFinite(durationSeconds) ? durationSeconds : null,
          )}`,
        },
      }));
    } catch (value) {
      setRoutePreviews((current) => ({
        ...current,
        [legIndex]: {
          busy: false,
          error: value instanceof Error ? value.message : 'Google Maps คำนวณเส้นทางไม่สำเร็จ',
        },
      }));
    }
  }

  return (
    <fieldset className="expense-line-card">
      <legend>รายการที่ {index + 1}</legend>
      <div className="expense-line-heading">
        <div>
          <strong>{categoryPolicy?.label ?? category}</strong>
          <p className="field-note">ใบเสร็จที่เลือกด้านล่างจะผูกกับรายการนี้โดยตรง</p>
        </div>
        <button
          className="button button-quiet"
          type="button"
          disabled={!canRemove}
          onClick={onRemove}
        >
          ลบรายการ
        </button>
      </div>

      <div className="form-grid-2">
        <label>
          <span>ประเภท</span>
          <select
            name={`${prefix}CategoryId`}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {options.expenseCategories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>วันที่</span>
          <input
            name={`${prefix}Date`}
            type="date"
            required
            defaultValue={textValue(initial.date)}
          />
        </label>
      </div>

      <label>
        <span>รายละเอียดรายการ</span>
        <input
          name={`${prefix}Description`}
          required
          defaultValue={textValue(initial.description)}
        />
      </label>

      {category === 'mileage' ? (
        <div className="subsection">
          <h3>เที่ยวเดินทาง</h3>
          <input type="hidden" name={`${prefix}MileageLegCount`} value={mileageLegCount} />
          {Array.from({ length: mileageLegCount }, (_, offset) => offset + 1).map((legIndex) => {
            const initialLeg = mileage[legIndex - 1] ?? {};
            const routeLeg =
              Boolean(textValue(initialLeg.originLabel)) ||
              Boolean(textValue(initialLeg.destinationLabel));
            const requiredLeg = legIndex === 1 || routeLeg;
            return (
              <div className="mileage-leg" key={legIndex}>
                <strong>เที่ยว {legIndex}</strong>
                <div className="form-grid-2">
                  <label>
                    <span>ต้นทาง</span>
                    <select
                      name={`${prefix}Leg${legIndex}Origin`}
                      defaultValue={
                        textValue(initialLeg.origin) || (legIndex === 1 ? 'home' : 'customer')
                      }
                    >
                      <option value="home">บ้าน</option>
                      <option value="office">สำนักงาน</option>
                      <option value="customer">ลูกค้า</option>
                      <option value="other">อื่น ๆ</option>
                    </select>
                  </label>
                  <label>
                    <span>ปลายทาง</span>
                    <select
                      name={`${prefix}Leg${legIndex}Destination`}
                      defaultValue={
                        textValue(initialLeg.destination) || (legIndex === 1 ? 'customer' : 'home')
                      }
                    >
                      <option value="home">บ้าน</option>
                      <option value="office">สำนักงาน</option>
                      <option value="customer">ลูกค้า</option>
                      <option value="other">อื่น ๆ</option>
                    </select>
                  </label>
                  <label>
                    <span>ต้นทาง / ที่อยู่</span>
                    <AddressAutocompleteInput
                      csrf={csrf}
                      name={`${prefix}Leg${legIndex}OriginLabel`}
                      placeIdName={`${prefix}Leg${legIndex}OriginPlaceId`}
                      required={requiredLeg}
                      placeholder="พิมพ์ชื่อสถานที่หรือที่อยู่ แล้วเลือกจาก Google Maps"
                      defaultValue={textValue(initialLeg.originLabel)}
                    />
                  </label>
                  <label>
                    <span>ปลายทาง / ที่อยู่</span>
                    <AddressAutocompleteInput
                      csrf={csrf}
                      name={`${prefix}Leg${legIndex}DestinationLabel`}
                      placeIdName={`${prefix}Leg${legIndex}DestinationPlaceId`}
                      required={requiredLeg}
                      placeholder="พิมพ์ชื่อสถานที่หรือที่อยู่ แล้วเลือกจาก Google Maps"
                      defaultValue={textValue(initialLeg.destinationLabel)}
                    />
                  </label>
                </div>
                <label>
                  <span>ระยะทาง (กม.){requiredLeg ? '' : ' — ไม่บังคับ'}</span>
                  <input
                    name={`${prefix}Leg${legIndex}Km`}
                    inputMode="decimal"
                    required={requiredLeg}
                    placeholder="55"
                    defaultValue={
                      typeof initialLeg.distanceMetres === 'number'
                        ? String(initialLeg.distanceMetres / 1000)
                        : ''
                    }
                  />
                </label>
                <div className="action-row mileage-route-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={routePreviews[legIndex]?.busy}
                    onClick={() => void previewMileageLeg(legIndex)}
                  >
                    {routePreviews[legIndex]?.busy ? 'กำลังคำนวณ…' : 'คำนวณด้วย Google Maps'}
                  </button>
                  {routePreviews[legIndex]?.message ? (
                    <span className="field-note" role="status">
                      {routePreviews[legIndex]?.message}
                    </span>
                  ) : null}
                  {routePreviews[legIndex]?.error ? (
                    <span className="field-warning" role="alert">
                      {routePreviews[legIndex]?.error}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div className="action-row">
            <button
              className="button button-secondary"
              type="button"
              disabled={mileageLegCount >= 20}
              onClick={() => setMileageLegCount((count) => Math.min(20, count + 1))}
            >
              เพิ่มเที่ยว
            </button>
            <button
              className="button button-quiet"
              type="button"
              disabled={mileageLegCount <= 2}
              onClick={() => setMileageLegCount((count) => Math.max(2, count - 1))}
            >
              ลบเที่ยวสุดท้าย
            </button>
          </div>
          <p className="field-note">
            Mileage คำนวณจากระยะทาง × อัตรานโยบาย และแยกจาก Toll / Parking / Fuel / Taxi / Grab เสมอ
          </p>
          <p className="field-note">
            Google Maps ใช้สำหรับ preview แบบ no-store เพื่อช่วยกรอกระยะทางเท่านั้น เมื่อส่งคำขอ
            ระบบจะบันทึกระยะทางที่พนักงานตรวจและรับรอง ไม่เก็บผล Routes API เป็นหลักฐานถาวร
          </p>
        </div>
      ) : (
        <label>
          <span>จำนวนเงิน (บาท)</span>
          <input
            name={`${prefix}Amount`}
            required
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={textValue(initial.amount)}
          />
        </label>
      )}

      {category === 'entertainment' ? (
        <div className="subsection">
          <h3>ข้อมูลรับรองลูกค้า</h3>
          <label>
            <span>วัตถุประสงค์ทางธุรกิจ</span>
            <input
              name={`${prefix}Purpose`}
              required
              defaultValue={textValue(entertainment.purpose)}
            />
          </label>
          <label>
            <span>ลูกค้า / องค์กร</span>
            <input
              name={`${prefix}Customer`}
              required
              defaultValue={textValue(entertainment.customer)}
            />
          </label>
          <div className="form-grid-2">
            <label>
              <span>จำนวนผู้ร่วม</span>
              <input
                name={`${prefix}AttendeeCount`}
                type="number"
                min={1}
                max={200}
                required
                defaultValue={String(entertainment.attendeeCount ?? 1)}
              />
            </label>
            <label>
              <span>บริบทผู้ร่วม</span>
              <input
                name={`${prefix}AttendeeContext`}
                required
                defaultValue={textValue(entertainment.attendeeContext)}
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="subsection">
        <h3>หลักฐานของรายการนี้</h3>
        {documents.map((document) => (
          <input key={document.id} type="hidden" name={`${prefix}DocumentId`} value={document.id} />
        ))}
        {options.receiptInbox.length ? (
          <div className="receipt-picker-grid">
            {options.receiptInbox.map((receipt) => {
              const selectedHere = documents.some((document) => document.id === receipt.id);
              const selectedElsewhere = selectedDocumentIds.has(receipt.id) && !selectedHere;
              return (
                <button
                  className="receipt-picker-card"
                  type="button"
                  key={receipt.id}
                  disabled={selectedHere || selectedElsewhere || documents.length >= 10}
                  onClick={() =>
                    onDocumentsChange([...documents, { id: receipt.id, name: receipt.filename }])
                  }
                >
                  <Image
                    src={`/api/documents/${receipt.id}`}
                    alt=""
                    width={96}
                    height={96}
                    unoptimized
                  />
                  <span className="receipt-picker-copy">
                    <strong>{receipt.filename}</strong>
                    <small>
                      {fileSize(receipt.byteSize)} · {uploadedWhen(receipt.uploadedAt)}
                    </small>
                    <span>
                      {selectedHere
                        ? 'ใช้กับรายการนี้แล้ว'
                        : selectedElsewhere
                          ? 'ใช้กับรายการอื่นในคำขอนี้แล้ว'
                          : 'เลือกใช้ใบเสร็จนี้'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted">ไม่มีใบเสร็จที่ยังไม่ได้จับคู่ใน Receipt Inbox</p>
        )}

        <DocumentUploader
          csrf={csrf}
          evidenceClass="expense"
          documents={documents}
          onChange={onDocumentsChange}
          required={evidenceRequired}
        />
        <p className="field-note">
          {evidenceRequired
            ? 'นโยบายกำหนดให้รายการนี้ต้องมีหลักฐานก่อนส่ง'
            : 'รายการนี้ไม่บังคับหลักฐานดิจิทัลตามนโยบายปัจจุบัน'}
          {categoryPolicy?.originalRequired ? ' · ต้องติดตามใบเสร็จต้นฉบับแยกจากสถานะการจ่าย' : ''}
        </p>
      </div>
    </fieldset>
  );
}
