'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface SyncStatus {
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked';
  attempts: number;
  result: {
    pages?: number;
    sourceEvents?: number;
    suggestions?: number;
    removedEvents?: number;
    deltaReset?: boolean;
  } | null;
  lastErrorCode: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

      const jobId = result?.sync?.jobId as string | undefined;
      if (!jobId) throw new Error('ระบบไม่ส่งรหัสงาน Sync กลับมา');
      setMessage('กำลังซิงก์ Microsoft Graph…');

      for (let attempt = 0; attempt < 30; attempt++) {
        await sleep(700);
        const statusResponse = await fetch(`/api/worklog/sync?jobId=${encodeURIComponent(jobId)}`, {
          cache: 'no-store',
        });
        const statusBody = await statusResponse.json();
        if (!statusResponse.ok)
          throw new Error(statusBody?.error?.message ?? 'ตรวจสถานะ Sync ไม่สำเร็จ');

        const status = statusBody.sync as SyncStatus;
        if (status.state === 'succeeded') {
          const sourceEvents = status.result?.sourceEvents ?? 0;
          const suggestions = status.result?.suggestions ?? 0;
          setMessage(
            `Sync สำเร็จ · Graph ${sourceEvents} event · อัปเดต ${suggestions} รายการ${status.result?.deltaReset ? ' · reset delta token แล้ว' : ''}`,
          );
          router.refresh();
          return;
        }
        if (status.state === 'failed' || status.state === 'blocked') {
          throw new Error(
            status.lastErrorCode
              ? `Sync ไม่สำเร็จ: ${status.lastErrorCode}`
              : 'Sync Outlook ไม่สำเร็จหลังลองซ้ำแล้ว',
          );
        }
      }

      setMessage('งาน Sync ยังประมวลผลอยู่ กรุณาดูสถานะล่าสุดบนหน้านี้');
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
        {busy ? 'กำลัง Sync…' : 'Sync Outlook Now'}
      </button>
      <span className="field-note">
        {enabled ? message : 'Outlook Calendar sync ยังไม่ได้เปิดใช้งาน'}
      </span>
    </div>
  );
}
