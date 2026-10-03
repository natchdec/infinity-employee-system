'use client';

import { useState } from 'react';

interface DepartmentOption {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

async function mutate(csrf: string, objectId: string, body: unknown) {
  const response = await fetch(`/api/admin/directory/accounts/${objectId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrf,
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? 'บันทึก Directory ไม่สำเร็จ');
  return result;
}

export function DirectoryAccountActions({
  csrf,
  objectId,
  reviewState,
  accountEnabled,
  userType,
  departments,
}: {
  csrf: string;
  objectId: string;
  reviewState: 'unreviewed' | 'employee' | 'ignored';
  accountEnabled: boolean;
  userType: string;
  departments: DepartmentOption[];
}) {
  const [departmentId, setDepartmentId] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function act(body: unknown) {
    setBusy(true);
    setMessage('');
    try {
      await mutate(csrf, objectId, body);
      setMessage('บันทึกแล้ว');
      window.setTimeout(() => window.location.reload(), 300);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึก Directory ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  if (reviewState === 'ignored') {
    return (
      <div className="admin-card-actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void act({ action: 'unignore' })}
        >
          นำกลับมาตรวจ
        </button>
        {message ? <span className="field-note">{message}</span> : null}
      </div>
    );
  }

  const canCreate = accountEnabled && userType.toLowerCase() === 'member';
  return (
    <div className="directory-actions">
      {canCreate ? (
        <>
          <select
            aria-label="แผนกพนักงาน"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">เลือกแผนก</option>
            {departments
              .filter((item) => item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </option>
              ))}
          </select>
          <input
            aria-label="วันเริ่มงาน"
            type="date"
            value={hireDate}
            onChange={(event) => setHireDate(event.target.value)}
          />
          <button
            className="button button-primary"
            type="button"
            disabled={busy || !departmentId || !hireDate}
            onClick={() => void act({ action: 'create_employee', departmentId, hireDate })}
          >
            เพิ่มเป็นพนักงาน
          </button>
        </>
      ) : (
        <span className="field-note">บัญชีนี้ไม่ใช่ Enabled Member</span>
      )}
      <button
        className="button button-secondary"
        type="button"
        disabled={busy}
        onClick={() => void act({ action: 'ignore' })}
      >
        ไม่ใช่พนักงาน
      </button>
      {message ? <span className="field-note">{message}</span> : null}
    </div>
  );
}
