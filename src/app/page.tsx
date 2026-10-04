import {
  AirplaneTilt,
  CalendarBlank,
  CalendarCheck,
  ClockCountdown,
  Receipt,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { bangkokDate } from '@/domain/calendar';
import { AppShell, Money, StateLabel } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';
import { employeeMonthlyStatement } from '@/server/monthly-statement';
import { employeeRequests } from '@/server/queries';
import { employeeWorklogRows } from '@/server/worklog-queries';

export const dynamic = 'force-dynamic';

const kindLabel = {
  leave: 'ลา',
  ot: 'OT',
  expense: 'ค่าใช้จ่าย',
  trip: 'เดินทาง',
  advance: 'เงินทดรอง',
} as const;

function timeLabel(date: Date) {
  return date.toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function HomePage() {
  const actor = await requireActor();
  const month = bangkokDate(new Date()).slice(0, 7);
  const [requests, worklog, statement] = await Promise.all([
    employeeRequests(actor.id, 8),
    employeeWorklogRows(actor.id, month),
    employeeMonthlyStatement(actor.id, month),
  ]);

  const attention = requests.filter(
    (item) => item.workflowState === 'returned' || item.financeState === 'returned',
  );
  const expenseTotal = (
    BigInt(statement.expenseSatang) + BigInt(statement.mileageSatang)
  ).toString();

  return (
    <AppShell
      actor={actor}
      title={`สวัสดี ${actor.displayName}`}
      description="ภาพรวมงานและคำขอของคุณ"
      hideHeader
    >
      <section className="home-welcome">
        <div className="home-welcome-copy">
          <p className="home-eyebrow">INFINITY EMPLOYEE SYSTEM</p>
          <h1>สวัสดีครับ {actor.displayName}</h1>
          <p>ให้การทำงานในวันนี้ราบรื่นและมีประสิทธิภาพครับ</p>
        </div>
        <div className="home-welcome-date">
          <strong>
            {new Date().toLocaleDateString('th-TH', {
              timeZone: 'Asia/Bangkok',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </strong>
          <span>Infinity Solution Service</span>
        </div>
      </section>

      <section className="home-primary-actions" aria-label="สร้างคำขอ">
        <Link className="home-action-card" href="/requests/new?kind=leave">
          <span className="home-action-icon">
            <CalendarCheck size={25} weight="duotone" />
          </span>
          <span>
            <strong>ขออนุมัติลา</strong>
            <small>ลาป่วย, ลาพักร้อน</small>
          </span>
          <span className="home-action-arrow" aria-hidden="true">
            ›
          </span>
        </Link>
        <Link className="home-action-card" href="/requests/new?kind=ot">
          <span className="home-action-icon">
            <ClockCountdown size={25} weight="duotone" />
          </span>
          <span>
            <strong>ขอ OT</strong>
            <small>ทำงานล่วงเวลา</small>
          </span>
          <span className="home-action-arrow" aria-hidden="true">
            ›
          </span>
        </Link>
        <Link className="home-action-card" href="/requests/new?kind=expense">
          <span className="home-action-icon">
            <Receipt size={25} weight="duotone" />
          </span>
          <span>
            <strong>เบิกค่าใช้จ่าย</strong>
            <small>ค่ารถ, ที่พัก, ค่าเดินทาง</small>
          </span>
          <span className="home-action-arrow" aria-hidden="true">
            ›
          </span>
        </Link>
        <Link className="home-action-card" href="/requests/new?kind=trip">
          <span className="home-action-icon">
            <AirplaneTilt size={25} weight="duotone" />
          </span>
          <span>
            <strong>ขออนุมัติเดินทาง</strong>
            <small>เดินทางใน/ต่างประเทศ</small>
          </span>
          <span className="home-action-arrow" aria-hidden="true">
            ›
          </span>
        </Link>
      </section>

      <section className="home-dashboard-grid">
        <article className="home-panel home-calendar-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-icon">
                <CalendarBlank size={18} />
              </span>
              <strong>ปฏิทินงานของฉัน (Outlook)</strong>
            </div>
            <Link href="/worklog">ดูทั้งหมด →</Link>
          </div>
          <div className="home-agenda">
            {worklog.slice(0, 3).length ? (
              worklog.slice(0, 3).map((item) => (
                <div className="agenda-row" key={item.id}>
                  <span className="agenda-time">
                    {timeLabel(item.startAt)} - {timeLabel(item.endAt)}
                  </span>
                  <span className="agenda-dot" aria-hidden="true" />
                  <span className="agenda-title">{item.subject}</span>
                  <span className="agenda-type">
                    {item.intent === 'onsite' ? 'Onsite' : item.intent === 'ot' ? 'OT' : 'Leave'}
                  </span>
                </div>
              ))
            ) : (
              <p className="panel-empty">ยังไม่มีรายการที่ซิงก์จาก Outlook ในเดือนนี้</p>
            )}
          </div>
        </article>

        <article className="home-panel">
          <div className="panel-heading">
            <strong>คำขอล่าสุดของฉัน</strong>
            <Link href="/requests">ดูทั้งหมด →</Link>
          </div>
          <div className="home-request-list">
            {requests.slice(0, 4).map((item) => (
              <Link className="home-request-row" href={`/requests/${item.id}`} key={item.id}>
                <span>
                  <strong>{item.reference}</strong>
                  <small>
                    {kindLabel[item.kind]} · {item.title}
                  </small>
                </span>
                <StateLabel value={item.workflowState} />
              </Link>
            ))}
            {!requests.length ? <p className="panel-empty">ยังไม่มีคำขอ</p> : null}
          </div>
        </article>

        <article className="home-panel home-month-panel">
          <div className="panel-heading">
            <strong>สรุปการใช้งานเดือนนี้</strong>
            <Link href="/statement">ดูรายละเอียด →</Link>
          </div>
          <div className="month-mini-grid">
            <div>
              <span>ลา</span>
              <strong>{statement.leaveDays} วัน</strong>
            </div>
            <div>
              <span>OT</span>
              <strong>{statement.otHours} ชม.</strong>
            </div>
            <div>
              <span>ค่าใช้จ่าย</span>
              <strong>
                <Money satang={expenseTotal} />
              </strong>
            </div>
          </div>
          <div className="month-note">
            {attention.length ? (
              <span className="attention-inline">{attention.length} รายการต้องกลับไปแก้ไข</span>
            ) : (
              <span>ไม่มีรายการที่ต้องแก้ไขในตอนนี้</span>
            )}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
