'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function WorklogReviewControls({
  id,
  revision,
  state,
  csrf,
}: {
  id: string;
  revision: number;
  state: string;
  csrf: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function review(action: 'confirm' | 'ignore') {
    setBusy(action);
    setError('');
    try {
      const response = await fetch(`/api/worklog/${id}/commands`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ action, expectedRevision: revision }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error?.message ?? 'อัปเดต Calendar Draft ไม่สำเร็จ');
      }
      router.refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'อัปเดต Calendar Draft ไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  if (state === 'submitted' || state === 'cancelled') {
    return <span className="field-note">สร้างคำขอแล้ว</span>;
  }
  if (state === 'ignored') {
    return <span className="field-note">Ignore แล้ว</span>;
  }

  return (
    <div>
      <div className="action-row">
        {state === 'suggested' ? (
          <button
            className="button button-secondary"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void review('confirm')}
          >
            {busy === 'confirm' ? 'กำลังยืนยัน…' : 'Confirm'}
          </button>
        ) : null}
        <Link className="button button-primary" href={`/requests/new?worklog=${id}`}>
          {state === 'exception' ? 'แก้ไขและสร้างคำขอ' : 'ตรวจ/สร้างคำขอ'}
        </Link>
        <button
          className="button button-quiet"
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void review('ignore')}
        >
          {busy === 'ignore' ? 'กำลัง Ignore…' : 'Ignore'}
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
