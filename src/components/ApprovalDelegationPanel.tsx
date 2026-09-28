'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ApprovalDelegationRow } from '@/server/approval-delegation-service';

export function ApprovalDelegationPanel({
  csrf,
  delegations,
  candidates,
}: {
  csrf: string;
  delegations: ApprovalDelegationRow[];
  candidates: { id: string; displayName: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function call(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError('');
    try {
      const response = await fetch('/api/approvals/delegations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'บันทึกการมอบหมายไม่สำเร็จ');
      router.refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'บันทึกการมอบหมายไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await call(
      {
        action: 'create',
        delegateId: String(data.get('delegateId') ?? ''),
        effectiveFrom: String(data.get('effectiveFrom') ?? ''),
        effectiveTo: String(data.get('effectiveTo') ?? ''),
      },
      'create',
    );
  }

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>Approval Delegation</h2>
          <p>มอบหมายผู้อนุมัติแทนแบบมีวันเริ่ม/สิ้นสุด โดยสิทธิ์อนุมัติตนเองยังถูกห้าม</p>
        </div>
      </div>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <form className="request-form" onSubmit={create}>
        <div className="form-grid-2">
          <label>
            <span>ผู้รับมอบหมาย</span>
            <select name="delegateId" required defaultValue="">
              <option value="" disabled>
                เลือก Head
              </option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.displayName}
                </option>
              ))}
            </select>
          </label>
          <span />
          <label>
            <span>ตั้งแต่วันที่</span>
            <input name="effectiveFrom" type="date" required />
          </label>
          <label>
            <span>ถึงวันที่</span>
            <input name="effectiveTo" type="date" required />
          </label>
        </div>
        <div className="form-actions">
          <button className="button button-secondary" type="submit" disabled={Boolean(busy)}>
            {busy === 'create' ? 'กำลังบันทึก…' : 'เพิ่มการมอบหมาย'}
          </button>
        </div>
      </form>

      {delegations.length ? (
        <div className="data-table-wrap" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ผู้รับมอบหมาย</th>
                <th>ช่วงวันที่</th>
                <th>สถานะ</th>
                <th>การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {delegations.map((row) => (
                <tr key={row.id}>
                  <td>{row.delegateName}</td>
                  <td>
                    {row.effectiveFrom} – {row.effectiveTo}
                  </td>
                  <td>{row.active ? 'Active' : 'Disabled'}</td>
                  <td>
                    {row.active ? (
                      <button
                        className="button button-quiet"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void call(
                            {
                              action: 'disable',
                              id: row.id,
                              expectedRevision: row.revision,
                            },
                            row.id,
                          )
                        }
                      >
                        {busy === row.id ? 'กำลังปิด…' : 'ปิดการมอบหมาย'}
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <p>ยังไม่มีการมอบหมายสิทธิ์อนุมัติ</p>
        </div>
      )}
    </section>
  );
}
