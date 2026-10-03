import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { bangkokDate } from '../domain/calendar';
import { invariant, type Actor, type Json } from '../domain/core';
import { canViewRequest } from '../domain/requests';
import { command, db } from './db';
import { getObject, putObject } from './storage';

export type EvidenceClass = 'expense' | 'medical' | 'settlement';

export interface DocumentResult {
  id: string;
  filename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  evidenceClass: EvidenceClass;
}

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 100_000_000;

function detectedImage(bytes: Uint8Array): { mediaType: string; extension: string } | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return { mediaType: 'image/png', extension: 'png' };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { mediaType: 'image/jpeg', extension: 'jpg' };
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  )
    return { mediaType: 'image/webp', extension: 'webp' };
  return null;
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-';
}

export async function uploadDocument(
  actor: Actor,
  file: { filename: string; bytes: Uint8Array },
  evidenceClass: EvidenceClass,
  idempotencyKey: string,
): Promise<DocumentResult> {
  invariant(
    file.bytes.length > 0 && file.bytes.length <= MAX_DOCUMENT_BYTES,
    'DOCUMENT_SIZE',
    'ไฟล์ต้องมีขนาดไม่เกิน 10 MB',
  );
  const detected = detectedImage(file.bytes);
  if (!detected && isPdf(file.bytes)) {
    invariant(false, 'PDF_SCAN_UNAVAILABLE', 'ยังไม่เปิดรับ PDF จนกว่าจะตั้งค่าการสแกนไฟล์อันตราย');
  }
  invariant(detected, 'DOCUMENT_TYPE', 'รองรับรูปภาพ JPEG, PNG หรือ WebP สำหรับหลักฐาน V1');
  const metadata = await sharp(file.bytes, {
    failOn: 'error',
    limitInputPixels: MAX_IMAGE_PIXELS,
  }).metadata();
  invariant(
    metadata.width && metadata.height && metadata.width * metadata.height <= MAX_IMAGE_PIXELS,
    'DOCUMENT_IMAGE_INVALID',
    'รูปภาพไม่ถูกต้องหรือมีขนาดพิกเซลสูงเกินไป',
  );
  const sha256 = createHash('sha256').update(file.bytes).digest('hex');
  const storageKey = `documents/${actor.id}/${evidenceClass}/${sha256.slice(0, 2)}/${sha256}.${detected.extension}`;

  const input = {
    filename: file.filename.slice(0, 240),
    byteSize: file.bytes.length,
    sha256,
    evidenceClass,
    storageKey,
    mediaType: detected.mediaType,
  };
  return command(actor, 'document.upload', idempotencyKey, input, async (tx) => {
    const [existing] = await tx`
      select id,filename,media_type,byte_size,sha256,evidence_class
      from documents
      where owner_id=${actor.id}
        and storage_key=${storageKey}
        and evidence_class=${evidenceClass}
      limit 1
    `;
    if (existing) {
      return {
        id: existing.id,
        filename: existing.filename,
        mediaType: existing.media_type,
        byteSize: existing.byte_size,
        sha256: existing.sha256,
        evidenceClass: existing.evidence_class,
      } satisfies DocumentResult as unknown as Json;
    }
    await putObject(storageKey, file.bytes, detected.mediaType);
    const id = randomUUID();
    const [row] = await tx`
      insert into documents(
        id,owner_id,storage_key,filename,media_type,byte_size,sha256,scan_state,evidence_class
      )
      values(
        ${id},${actor.id},${storageKey},${input.filename},${detected.mediaType},
        ${file.bytes.length},${sha256},'clean',${evidenceClass}
      )
      returning id,filename,media_type,byte_size,sha256,evidence_class
    `;
    invariant(row, 'DOCUMENT_SAVE_FAILED', 'บันทึกข้อมูลเอกสารไม่สำเร็จ', 500);
    return {
      id: row.id,
      filename: row.filename,
      mediaType: row.media_type,
      byteSize: row.byte_size,
      sha256: row.sha256,
      evidenceClass: row.evidence_class,
    } satisfies DocumentResult as unknown as Json;
  }) as unknown as Promise<DocumentResult>;
}

export async function documentForActor(
  actor: Actor,
  documentId: string,
): Promise<{ bytes: Buffer; filename: string; mediaType: string }> {
  const [doc] = await db()`
    select id,owner_id,storage_key,filename,media_type,scan_state
    from documents
    where id=${documentId}
  `;
  invariant(doc && doc.scan_state === 'clean', 'DOCUMENT_NOT_FOUND', 'ไม่พบเอกสาร', 404);
  let allowed = doc.owner_id === actor.id;
  if (!allowed) {
    const linked = await db()`
      select distinct r.employee_id,r.assigned_head_id,r.kind
      from document_links l
      join requests r on r.id=l.request_id
      where l.document_id=${documentId}
    `;
    allowed = linked.some((row) =>
      canViewRequest(actor, {
        employee_id: row.employee_id,
        assigned_head_id: row.assigned_head_id,
        kind: row.kind,
      }),
    );
    if (!allowed && actor.roles.includes('head')) {
      const date = bangkokDate(new Date());
      const delegated = await db()`
        select 1
        from document_links l
        join requests r on r.id=l.request_id
        join approval_delegations d on d.delegator_id=r.assigned_head_id
        where l.document_id=${documentId}
          and r.workflow_state='pending_head'
          and d.active
          and d.scope='manager_approval'
          and d.delegate_id=${actor.id}
          and d.effective_from <= ${date}::date
          and d.effective_to >= ${date}::date
          and r.employee_id <> ${actor.id}
        limit 1
      `;
      allowed = delegated.length > 0;
    }
  }
  invariant(allowed, 'DOCUMENT_NOT_FOUND', 'ไม่พบเอกสาร', 404);
  return {
    bytes: await getObject(doc.storage_key),
    filename: doc.filename,
    mediaType: doc.media_type,
  };
}
