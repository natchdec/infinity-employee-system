import {
  AirplaneTilt,
  CalendarCheck,
  ClockCountdown,
  Receipt,
  Wallet,
} from '@phosphor-icons/react/dist/ssr';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { RequestForm } from '@/components/request/RequestForm';
import type { RequestKind } from '@/domain/requests';
import { requireActor } from '@/server/auth-context';
import { cookieNames } from '@/server/identity';
import { requestFormOptions } from '@/server/request-view';
import { worklogRequestDraft } from '@/server/worklog-review-service';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ kind?: string; worklog?: string }>;
}

const choices: {
  id: RequestKind;
  title: string;
  description: string;
  shortLabel: string;
}[] = [
  {
    id: 'leave',
    title: 'ลา',
    shortLabel: 'ลาป่วย / ลาพักร้อน',
    description: 'ลาเต็มวัน ตรวจสิทธิและนโยบายที่มีผล',
  },
  {
    id: 'ot',
    title: 'OT',
    shortLabel: 'ทำงานล่วงเวลา',
    description: 'กรอกชั่วโมงทีละ 0.5 ชั่วโมงตามหมวด OT ที่ใช้จริง',
  },
  {
    id: 'expense',
    title: 'ค่าใช้จ่าย / ค่ารถ',
    shortLabel: 'Mileage, Taxi, Grab และใบเสร็จ',
    description: 'เบิกค่าเดินทาง ค่าใช้จ่าย และแนบหลักฐานต่อรายการ',
  },
  {
    id: 'trip',
    title: 'เดินทางไปปฏิบัติงาน',
    shortLabel: 'Business Trip',
    description: 'ทริปในประเทศ/ต่างประเทศ เบี้ยเลี้ยง และค่าใช้จ่ายที่เกี่ยวข้อง',
  },
  {
    id: 'advance',
    title: 'เงินทดรอง',
    shortLabel: 'Cash Advance',
    description: 'ขอเงินทดรองสำหรับทริปที่อนุมัติแล้ว',
  },
];

function ChoiceIcon({ kind }: { kind: RequestKind }) {
  if (kind === 'leave') return <CalendarCheck size={31} weight="duotone" />;
  if (kind === 'ot') return <ClockCountdown size={31} weight="duotone" />;
  if (kind === 'expense') return <Receipt size={31} weight="duotone" />;
  if (kind === 'trip') return <AirplaneTilt size={31} weight="duotone" />;
  return <Wallet size={31} weight="duotone" />;
}

export default async function NewRequestPage({ searchParams }: Props) {
  const actor = await requireActor();
  const { kind, worklog } = await searchParams;
  const source = worklog ? await worklogRequestDraft(actor, worklog) : null;
  const selected = choices.find((choice) => choice.id === (source?.kind ?? kind));

  if (!selected) {
    return (
      <AppShell
        actor={actor}
        title="สร้างคำขอใหม่"
        description="เลือกประเภทก่อน แล้วระบบจะแสดงเฉพาะข้อมูลที่เกี่ยวข้อง"
      >
        <section className="section request-kind-section">
          <div className="section-header">
            <div>
              <h2>เลือกประเภทคำขอ</h2>
              <p>เริ่มจากประเภทที่ต้องการ ระบบจะคงขั้นอนุมัติและนโยบายเดิมให้อัตโนมัติ</p>
            </div>
          </div>
          <div className="chooser request-kind-chooser">
            {choices.map((choice) => (
              <Link
                className={`request-kind-choice is-${choice.id}`}
                href={`/requests/new?kind=${choice.id}`}
                key={choice.id}
              >
                <span className="request-choice-icon">
                  <ChoiceIcon kind={choice.id} />
                </span>
                <span className="request-choice-copy">
                  <strong>{choice.title}</strong>
                  <small>{choice.shortLabel}</small>
                  <span>{choice.description}</span>
                </span>
                <span className="request-choice-action" aria-hidden="true">
                  เลือก →
                </span>
              </Link>
            ))}
          </div>
          <div className="request-calendar-hint">
            <span className="request-calendar-hint-icon">
              <CalendarCheck size={22} weight="duotone" />
            </span>
            <span>
              <strong>มีรายการจาก Outlook Calendar?</strong>
              <small>
                ไปที่ปฏิทินงานเพื่อ Review OT / Onsite / Leave Draft
                แล้วสร้างคำขอจากข้อมูลที่ซิงก์ไว้
              </small>
            </span>
            <Link className="button button-secondary" href="/worklog">
              เปิดปฏิทินงาน
            </Link>
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
      <RequestForm
        kind={selected.id}
        csrf={csrf}
        options={options}
        initial={source?.initial}
        sourceWorklogId={source?.sourceWorklogId}
        sourceWorklogRevision={source?.sourceRevision}
        sourceWorklogs={source?.sourceWorklogs}
      />
    </AppShell>
  );
}
