import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { ReceiptInboxCapture } from '@/components/ReceiptInboxCapture';
import { requireActor } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { unassignedReceiptInbox } from '@/server/operations-queries';

export const dynamic = 'force-dynamic';

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function when(value: Date): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export default async function ReceiptInboxPage() {
  const actor = await requireActor();
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const rows = await unassignedReceiptInbox(actor.id);

  return (
    <AppShell
      actor={actor}
      title="Receipt Inbox"
      description="หลักฐานค่าใช้จ่ายที่อัปโหลดแล้วแต่ยังไม่ได้ผูกกับคำขอ"
    >
      <section className="section">
        <div className="notice">
          <p>
            เอกสารใน Inbox ยังไม่ถือว่าเป็นการเบิกค่าใช้จ่าย ต้องเลือกไปผูกกับ Expense ตอน Review
            ก่อน Submit
          </p>
        </div>
      </section>
      <section className="section">
        <ReceiptInboxCapture csrf={csrf} />
      </section>
      <section className="section">
        {rows.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ไฟล์</th>
                  <th>ชนิด</th>
                  <th>ขนาด</th>
                  <th>อัปโหลด</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.filename}</td>
                    <td>{row.mediaType}</td>
                    <td>{fileSize(row.byteSize)}</td>
                    <td>{when(row.uploadedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ไม่มีใบเสร็จที่รอจับคู่</h2>
            <p>หลักฐานที่ยังไม่ได้ผูกกับ Expense จะมาปรากฏที่นี่</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
