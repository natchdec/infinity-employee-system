'use client';

import { useState } from 'react';

export interface UploadedDocument {
  id: string;
  name: string;
}

interface Props {
  csrf: string;
  evidenceClass: 'expense' | 'medical';
  documents: UploadedDocument[];
  onChange: (documents: UploadedDocument[]) => void;
  required?: boolean;
}

export function DocumentUploader({
  csrf,
  evidenceClass,
  documents,
  onChange,
  required = false,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function upload(file: File) {
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set('evidenceClass', evidenceClass);
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'อัปโหลดหลักฐานไม่สำเร็จ');
      onChange([
        ...documents,
        {
          id: result.document.id as string,
          name: result.document.filename as string,
        },
      ]);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'อัปโหลดหลักฐานไม่สำเร็จ');
    } finally {
      setUploading(false);
    }
  }

  return (
    <fieldset>
      <legend>หลักฐาน</legend>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <label className="upload-control">
        <span>{evidenceClass === 'expense' ? 'ถ่ายรูป / เลือกรูปใบเสร็จ' : 'แนบหลักฐาน'}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          disabled={uploading}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void upload(file);
            event.currentTarget.value = '';
          }}
        />
      </label>
      <p className="field-note">
        รองรับ JPEG, PNG, WebP ไม่เกิน 10 MB · PDF ถูกปิดจนกว่าจะมี malware scanning
      </p>
      {documents.length ? (
        <ul className="document-list">
          {documents.map((document, index) => (
            <li key={document.id}>
              <span>{document.name}</span>
              <button
                type="button"
                className="text-button"
                onClick={() => onChange(documents.filter((_, itemIndex) => itemIndex !== index))}
              >
                เอาออกจากคำขอนี้
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">ยังไม่มีหลักฐานแนบ</p>
      )}
      {required && !documents.length ? (
        <p className="field-warning">ประเภทนี้ต้องมีหลักฐานก่อนส่ง</p>
      ) : null}
    </fieldset>
  );
}
