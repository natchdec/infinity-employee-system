'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface NotificationListItem {
  id: string;
  title: string;
  href: string;
  createdAt: string;
  readAt: string | null;
}

function when(value: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function NotificationList({ rows, csrf }: { rows: NotificationListItem[]; csrf: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');

  async function open(row: NotificationListItem) {
    if (!row.readAt) {
      setBusy(row.id);
      try {
        await fetch(`/api/notifications/${row.id}/read`, {
          method: 'POST',
          headers: {
            'x-csrf-token': csrf,
            'idempotency-key': crypto.randomUUID(),
          },
        });
      } finally {
        setBusy('');
      }
    }
    router.push(row.href);
  }

  if (!rows.length) {
    return (
      <div className="empty">
        <h2>ไม่มีการแจ้งเตือน</h2>
        <p>ระบบจะแสดงรายการที่ต้องติดตามเมื่อมีเหตุการณ์ใน workflow</p>
      </div>
    );
  }

  return (
    <div className="quick-list">
      {rows.map((row) => (
        <button className="quick-link" type="button" key={row.id} onClick={() => void open(row)}>
          <strong>{row.title}</strong>
          <span>
            {when(row.createdAt)}
            {row.readAt ? ' · อ่านแล้ว' : busy === row.id ? ' · กำลังเปิด…' : ' · ยังไม่ได้อ่าน'}
          </span>
        </button>
      ))}
    </div>
  );
}
