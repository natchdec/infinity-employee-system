import { cookies } from 'next/headers';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { RequestForm } from '@/components/request/RequestForm';
import type { RequestKind } from '@/domain/requests';
import { requireActor } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { requestFormOptions } from '@/server/request-view';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ kind?: string }>;
}

const choices: {
  id: RequestKind;
  title: string;
  description: string;
}[] = [
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
    description: 'ทริป เบี้ยเลี้ยง และรายการที่เกี่ยวข้อง',
  },
  {
    id: 'advance',
    title: 'เงินทดรอง',
    description: 'ขอเงินทดรองสำหรับทริปที่อนุมัติแล้ว',
  },
];

export default async function NewRequestPage({ searchParams }: Props) {
  const actor = await requireActor();
  const { kind } = await searchParams;
  const selected = choices.find((choice) => choice.id === kind);

  if (!selected) {
    return (
      <AppShell
        actor={actor}
        title="สร้างคำขอ"
        description="เลือกประเภทงานก่อน ระบบจะแสดงเฉพาะข้อมูลที่จำเป็น"
      >
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

  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const options = await requestFormOptions(actor);

  return (
    <AppShell actor={actor} title={selected.title} description={selected.description}>
      <RequestForm kind={selected.id} csrf={csrf} options={options} />
    </AppShell>
  );
}
