'use client';

import { useState } from 'react';

export interface MonthlyPeriodControlRow {
  month: string;
  family: 'payroll' | 'claims';
  state: 'open' | 'closing' | 'locked';
  revision: number;
}

const familyLabel = {
  payroll: 'Payroll / OT / Leave',
  claims: 'Expense / Travel / Settlement',
} as const;

const stateLabel = {
  open: 'เปิดรับรายการ',
  closing: 'กำลังปิดรอบ',
  locked: 'ล็อกแล้ว',
} as const;

export function MonthlyCloseControls({
  csrf,
  rows,
}: {
  csrf: string;
  rows: MonthlyPeriodControlRow[];
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function transition(
    row: MonthlyPeriodControlRow,
    target: MonthlyPeriodControlRow['state'],
  ) {
    const key = `${row.month}:${row.family}:${target}`;
    setBusy(key);
    setError('');
    try {
      const response = await fetch('/api/finance/monthly-periods', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          month: row.month,
          family: row.family,
          target,
          expectedRevision: row.revision,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'เปลี่ยนสถานะรอบเดือนไม่สำเร็จ');
      window.location.reload();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'เปลี่ยนสถานะรอบเดือนไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="section">
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="data-table-wrap" tabIndex={0}>
        <table className="data-table">
          <thead>
            <tr>
              <th>เดือน</th>
              <th>รอบงาน</th>
              <th>สถานะ</th>
              <th>การดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.month}:${row.family}`}>
                <td>{row.month}</td>
                <td>{familyLabel[row.family]}</td>
                <td>{stateLabel[row.state]}</td>
                <td>
                  <div className="action-row">
                    {row.state === 'open' ? (
                      <button
                        className="button button-secondary"
                        disabled={Boolean(busy)}
                        onClick={() => void transition(row, 'closing')}
                      >
                        เริ่มปิดรอบ
                      </button>
                    ) : null}
                    {row.state === 'closing' ? (
                      <>
                        <button
                          className="button button-secondary"
                          disabled={Boolean(busy)}
                          onClick={() => void transition(row, 'open')}
                        >
                          กลับมาเปิด
                        </button>
                        <button
                          className="button button-primary"
                          disabled={Boolean(busy)}
                          onClick={() => void transition(row, 'locked')}
                        >
                          Lock รอบเดือน
                        </button>
                      </>
                    ) : null}
                    {row.state === 'locked' ? (
                      <span>ใช้ Adjustment เมื่อต้องแก้ย้อนหลัง</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
