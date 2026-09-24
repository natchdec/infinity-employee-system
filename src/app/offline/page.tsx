import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="signin-shell">
      <section className="signin-panel" aria-labelledby="offline-title">
        <p className="signin-brand">INFINITY SOLUTION SERVICE</p>
        <h1 id="offline-title">ขณะนี้ออฟไลน์</h1>
        <p>
          หน้านี้ไม่เก็บข้อมูลคำขอหรือข้อมูลการเงินไว้ในเครื่อง
          กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่
        </p>
        <Link className="button button-primary" href="/">
          ลองอีกครั้ง
        </Link>
      </section>
    </main>
  );
}
