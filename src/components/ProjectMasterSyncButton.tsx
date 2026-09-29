'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ProjectMasterSyncButton({ csrf, enabled }: { csrf: string; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function syncNow() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/projects/sync', {
        method: 'POST',
        headers: {
          'x-csrf-token': csrf,
          'idempotency-key': String(Date.now()),
        },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'Project Master sync failed');
      setMessage('Project Master sync queued.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Project Master sync failed');
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
        {busy ? 'Queueing sync...' : 'Sync Project Master Now'}
      </button>
      <span className="field-note">
        {enabled ? message : 'Project Master production connection is not configured.'}
      </span>
    </div>
  );
}
