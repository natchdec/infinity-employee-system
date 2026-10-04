'use client';

import { useMemo, useState } from 'react';

function metresToKm(value: number | null): string {
  if (value === null) return '';
  return (value / 1000).toFixed(3).replace(/\.?0+$/, '');
}

function kmToMetres(value: string): number | null {
  if (!/^(0|[1-9]\d{0,2})(\.\d{1,3})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const metres = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  return metres <= 500_000 ? metres : null;
}

export function CommuteDistanceForm({
  csrf,
  homeAddressConfigured,
  initialDistanceMetres,
  initialEffectiveFrom,
}: {
  csrf: string;
  homeAddressConfigured: boolean;
  initialDistanceMetres: number | null;
  initialEffectiveFrom: string | null;
}) {
  const [kilometres, setKilometres] = useState(() => metresToKm(initialDistanceMetres));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const distanceMetres = useMemo(() => kmToMetres(kilometres.trim()), [kilometres]);

  async function save() {
    if (distanceMetres === null) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/profile/commute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ distanceMetres }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error?.message ?? 'บันทึกระยะทาง Home → Office ไม่สำเร็จ');
      }
      const effectiveFrom =
        typeof result?.profile?.effectiveFrom === 'string'
          ? result.profile.effectiveFrom
          : initialEffectiveFrom;
      setMessage(
        effectiveFrom
          ? `บันทึกระยะทางมาตรฐานแล้ว · มีผล ${effectiveFrom}`
          : 'บันทึกระยะทางมาตรฐานแล้ว',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกระยะทาง Home → Office ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-home-address">
      <label>
        <span>ระยะทางมาตรฐาน Home → Office (เที่ยวเดียว)</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="500"
          step="0.001"
          value={kilometres}
          onChange={(event) => setKilometres(event.target.value)}
          placeholder="เช่น 18.5"
          disabled={!homeAddressConfigured}
        />
      </label>
      <p className="field-note">
        หน่วยกิโลเมตร · พนักงานตรวจสอบและรับรองระยะทางเอง ระบบใช้ค่านี้หัก Commute
        เฉพาะเที่ยวที่เกี่ยวข้องกับ “บ้าน” และเก็บเป็น version เพื่อ Audit · baseline
        แรกจะใช้กับรายการย้อนหลังที่ยังไม่เคยส่งคำขอด้วย
      </p>
      {!homeAddressConfigured ? (
        <p className="field-note">บันทึก Home Address ด้านบนก่อน แล้วจึงกำหนดระยะทางมาตรฐาน</p>
      ) : null}
      {initialEffectiveFrom ? (
        <p className="field-note">ค่าปัจจุบันมีผลตั้งแต่ {initialEffectiveFrom}</p>
      ) : null}
      <div className="action-row">
        <button
          className="button button-secondary"
          type="button"
          disabled={busy || !homeAddressConfigured || distanceMetres === null}
          onClick={() => void save()}
        >
          {busy ? 'กำลังบันทึก…' : 'บันทึกระยะทาง Home → Office'}
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
