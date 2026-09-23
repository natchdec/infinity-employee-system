import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ kind?: string }>;
}

const choices = [
  {
    id: 'leave',
    title: 'ลา',
    description: 'ลาเต็มวัน ตรวจสิทธิและนโยบายที่มีผล',
  },
  {
    id: 'ot',
    title: 'OT',
    description: 'ระบุชั่วโมงจำนวนเต็มตามหมวดที่ระบบกำหนด',
  },
  {
    id: 'expense',
    title: 'ค่าใช้จ่าย',
    description: 'ค่าเดินทาง ใบเสร็จ Mileage และ Entertainment',
  },
  {
    id: 'trip',
    title: 'เดินทางเพื่อธุรกิจ',
    description: 'ทริป เบี้ยเลี้ยง เงินทดรอง และการเคลียร์ค่าใช้จ่าย',
  },
] as const;

export default async function NewRequestPage({ searchParams }: Props) {
  const actor = await requireActor();
  const { kind } = await searchParams;
  const selected = choices.find((choice) => choice.id === kind);

  return (
    <AppShell
      actor={actor}
      title="สร้างคำขอ"
      description="เลือกประเภทงานก่อน ระบบจะแสดงเฉพาะข้อมูลที่จำเป็น"
    >
      {selected ? (
        <div className="notice">
          <p>
            <strong>{selected.title}</strong> - {selected.description}
          </p>
          <p>
            ฟอร์มธุรกรรมกำลังเปิดใช้งานตาม milestone ของแต่ละโมดูล
            ขณะนี้ยังไม่มีการส่งข้อมูลจากหน้านี้
          </p>
        </div>
      ) : null}
      <section className="section">
        <div className="chooser">
          {choices.map((choice) => (
            <Link href={`/requests/new?kind=${choice.id}`} key={choice.id}>
              <span>
                <strong>{choice.title}</strong>
                <span>{choice.description}</span>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
