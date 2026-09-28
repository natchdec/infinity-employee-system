'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function WorklogSyncButton({ csrf, enabled }: { csrf: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function syncNow() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/worklog/sync', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'สั่ง Sync Outlook ไม่สำเร็จ');
      setMessage('รับคำสั่ง Sync แล้ว ระบบจะอัปเดต Calendar Inbox เมื่อ worker ทำงานเสร็จ');
      router.refresh();
    } catch (value) {
      setMessage(value instanceof Error ? value.message : 'สั่ง Sync Outlook ไม่สำเร็จ');
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
        {busy ? 'กำลังสั่ง Sync…' : 'Sync Outlook Now'}
      </button>
      <span className="field-note">
        {enabled ? message : 'Outlook Calendar sync ยังไม่ได้เปิดใช้งาน'}
      </span>
    </div>
  );
}
