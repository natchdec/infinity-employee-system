'use client';

import { useState } from 'react';

export function HomeAddressForm({
  csrf,
  initialHomeAddress,
}: {
  csrf: string;
  initialHomeAddress: string | null;
}) {
  const [homeAddress, setHomeAddress] = useState(initialHomeAddress ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/profile/home-address', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ homeAddress }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error?.message ?? 'บันทึกที่อยู่บ้านไม่สำเร็จ');
      }
      setMessage('บันทึก Home Address แล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกที่อยู่บ้านไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-home-address">
      <label>
        <span>Home Address</span>
        <textarea
          rows={2}
          value={homeAddress}
          onChange={(event) => setHomeAddress(event.target.value)}
          placeholder="กรอกที่อยู่บ้านให้ละเอียด เช่น บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์"
        />
      </label>
      <p className="field-note">
        ใช้สำหรับเติมต้นทาง/ปลายทาง “บ้าน” ใน Mileage เท่านั้น ไม่แสดงใน Project หรือรายงานสาธารณะ
      </p>
      <div className="action-row">
        <button
          className="button button-primary"
          type="button"
          disabled={busy || homeAddress.trim().length < 5}
          onClick={() => void save()}
        >
          {busy ? 'กำลังบันทึก…' : 'บันทึก Home Address'}
        </button>
        {message ? (
          <span className="field-note" role="status">
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
