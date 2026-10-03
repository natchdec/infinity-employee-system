import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { AppShell } from '@/components/AppShell';
import { ReceiptInboxCapture } from '@/components/ReceiptInboxCapture';
import { requireActor } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { receiptInbox } from '@/server/operations-queries';

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

const expenseCategoryLabel: Record<string, string> = {
  mileage: 'Mileage',
  taxi: 'Taxi',
  grab: 'Grab',
  toll: 'Toll',
  parking: 'Parking',
  rental_car: 'Rental Car',
  fuel: 'Fuel',
  hotel: 'Hotel',
  entertainment: 'Entertainment',
  other: 'Other',
};

export default async function ReceiptInboxPage() {
  const actor = await requireActor();
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const rows = await receiptInbox(actor.id);
  const unassigned = rows.filter((row) => !row.usage).length;

  return (
    <AppShell
      actor={actor}
      title="Receipt Inbox"
      description="อัปโหลดใบเสร็จก่อน แล้วค่อยจับคู่กับ Expense line ที่ถูกต้อง"
    >
      <section className="section">
        <div className="notice">
          <p>
            ใบเสร็จที่ยังไม่ใช้จะเลือกได้จากหน้า Expense แต่ละรายการ เมื่อ Submit
            แล้วสถานะจะเปลี่ยนเป็นคำขอและ Expense line ที่ใบนี้ถูกใช้
          </p>
        </div>
      </section>
      <section className="section">
        <ReceiptInboxCapture csrf={csrf} />
      </section>
      <section className="section">
        <div className="section-header">
          <div>
            <h2>ใบเสร็จทั้งหมด</h2>
            <p>{unassigned} ใบยังไม่ได้จับคู่ · แสดงล่าสุดสูงสุด 200 ใบ</p>
          </div>
        </div>
        {rows.length ? (
          <div className="receipt-inbox-grid">
            {rows.map((row) => {
              const category = row.usage?.categoryId
                ? (expenseCategoryLabel[row.usage.categoryId] ?? row.usage.categoryId)
                : null;
              return (
                <article className="receipt-inbox-card" key={row.id}>
                  <a
                    className="receipt-inbox-preview"
                    href={`/api/documents/${row.id}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`เปิด ${row.filename}`}
                  >
                    <Image
                      src={`/api/documents/${row.id}`}
                      alt=""
                      width={320}
                      height={220}
                      unoptimized
                    />
                  </a>
                  <div className="receipt-inbox-body">
                    <strong title={row.filename}>{row.filename}</strong>
                    <span className="field-note">
                      {fileSize(row.byteSize)} · {when(row.uploadedAt)}
                    </span>
                    {row.usage ? (
                      <div className="receipt-usage">
                        <span className="status-chip status-chip-used">ใช้งานแล้ว</span>
                        <Link href={`/requests/${row.usage.requestId}`}>
                          {row.usage.reference}
                          {category ? ` / ${category}` : ''}
                          {row.usage.line ? ` / Line ${row.usage.line}` : ''}
                        </Link>
                        {row.usage.description ? <small>{row.usage.description}</small> : null}
                      </div>
                    ) : (
                      <div className="receipt-usage">
                        <span className="status-chip">ยังไม่ได้ใช้งาน</span>
                        <Link href="/requests/new?kind=expense">สร้าง Expense แล้วเลือกใบนี้</Link>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มีใบเสร็จ</h2>
            <p>อัปโหลดรูปใบเสร็จด้านบน แล้วระบบจะเก็บไว้รอจับคู่กับ Expense</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
