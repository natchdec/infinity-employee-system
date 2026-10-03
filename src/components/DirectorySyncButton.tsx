'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DirectorySyncButton({ csrf, enabled }: { csrf: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function syncNow() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/directory/sync', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error?.message ?? 'สั่ง Sync Microsoft 365 ไม่สำเร็จ');
      }
      setMessage('รับคำสั่ง Sync แล้ว ระบบจะอัปเดตรายชื่อจาก Microsoft 365 ผ่าน worker');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'สั่ง Sync Microsoft 365 ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="action-row">
      <button
        className="button button-secondary"
        type="button"
        disabled={!enabled || busy}
        onClick={() => void syncNow()}
      >
        {busy ? 'กำลังสั่ง Sync…' : 'Sync Microsoft 365 Now'}
      </button>
      <span className="field-note">
        {enabled ? message : 'Microsoft 365 Directory sync ยังไม่ได้เปิดใช้งาน'}
      </span>
    </div>
  );
}
