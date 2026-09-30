import { cookies } from 'next/headers';
import { AppShell, StateLabel } from '@/components/AppShell';
import { WorklogReviewControls } from '@/components/WorklogReviewControls';
import { WorklogSyncButton } from '@/components/WorklogSyncButton';
import { bangkokDate } from '@/domain/calendar';
import { requireActor } from '@/server/auth-context';
import { config } from '@/server/config';
import { cookieNames } from '@/server/identity';
import { employeeWorklogRows, worklogSyncStatus } from '@/server/worklog-queries';

export const dynamic = 'force-dynamic';

const intentLabel = {
  ot: 'OT',
  onsite: 'Onsite / ค่ารถ',
  leave: 'ลา',
} as const;

const exceptionLabels: Record<string, string> = {
  CALENDAR_TIME_RANGE_REVIEW: 'เวลาเริ่ม/สิ้นสุด Calendar ต้องตรวจสอบ',
  OT_ALL_DAY_REVIEW: 'OT แบบ All-day ต้องตรวจสอบ',
  OT_DURATION_REVIEW: 'เวลา OT ต้องตรวจสอบ',
  OT_OVERLAP: 'OT Calendar ซ้อนเวลา ต้องตรวจสอบ',
  ONSITE_LOCATION_REQUIRED: 'Onsite ยังไม่มีสถานที่',
  ONSITE_MULTI_STOP_REVIEW: 'Onsite หลายจุด ต้องตรวจ route chain',
  LEAVE_FULL_DAY_REQUIRED: 'การลาต้องเป็นเต็มวัน',
  SOURCE_CHANGED_REVIEW: 'Calendar เปลี่ยนหลังยืนยัน',
  SOURCE_CHANGED_AFTER_SUBMIT: 'Calendar เปลี่ยนหลังส่งคำขอ',
  SOURCE_EVENT_CANCELLED: 'Calendar ต้นทางถูกยกเลิก',
  IES_CATEGORY_REMOVED: 'นำ IES Category ออกจาก Calendar แล้ว',
};

function bangkokDateTime(value: Date): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export default async function WorklogPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const actor = await requireActor();
  const store = await cookies();
  const csrf = store.get(cookieNames().csrf)?.value ?? '';
  const params = await searchParams;
  const currentMonth = bangkokDate(new Date()).slice(0, 7);
  const month = /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.month ?? '') ? params.month! : currentMonth;
  const [items, sync] = await Promise.all([
    employeeWorklogRows(actor.id, month),
    worklogSyncStatus(actor.id),
  ]);
  const counts = items.reduce(
    (result, item) => {
      result[item.intent]++;
      if (item.state === 'exception' || item.sourceChangedAfterConfirmation) result.review++;
      return result;
    },
    { ot: 0, onsite: 0, leave: 0, review: 0 },
  );

  return (
    <AppShell
      actor={actor}
      title="Calendar Inbox"
      description="ตรวจรายการที่ระบบอ่านจาก Outlook ก่อนสร้าง OT ค่ารถ หรือคำขอลา"
    >
      <section className="section">
        <div className="metric-row" aria-label="สรุป Calendar Inbox">
          <div className="metric">
            <strong>{counts.ot}</strong>
            <span>OT</span>
          </div>
          <div className="metric">
            <strong>{counts.onsite}</strong>
            <span>Onsite</span>
          </div>
          <div className="metric">
            <strong>{counts.leave}</strong>
            <span>ลา</span>
          </div>
          <div className="metric">
            <strong>{counts.review}</strong>
            <span>ต้องตรวจสอบ</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="notice">
          <p>
            ระบบอ่านเฉพาะ Outlook event ที่มี Category ขึ้นต้นด้วย <strong>IES ·</strong> เท่านั้น
            รายการในหน้านี้เป็น Draft และยังไม่ส่งอนุมัติอัตโนมัติ
          </p>
          <p>
            {sync?.lastSuccessAt
              ? `ซิงก์ล่าสุด ${bangkokDateTime(sync.lastSuccessAt)}`
              : 'ยังไม่มีผลการซิงก์ Outlook'}
            {sync?.lastErrorCode ? ` · ล่าสุดพบปัญหา ${sync.lastErrorCode}` : ''}
          </p>
          <WorklogSyncButton csrf={csrf} enabled={config().OUTLOOK_CALENDAR_SYNC_ENABLED} />
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>{month}</h2>
            <p>รายการที่ Ignore แล้วจะยังคงประวัติไว้แต่ไม่สร้างคำขอ</p>
          </div>
        </div>
        {items.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>วัน / เวลา</th>
                  <th>Calendar</th>
                  <th>ระบบตีความ</th>
                  <th>สถานที่</th>
                  <th>สถานะ</th>
                  <th>สิ่งที่ต้องตรวจ</th>
                  <th>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{bangkokDateTime(item.startAt)}</td>
                    <td>{item.subject}</td>
                    <td>{intentLabel[item.intent]}</td>
                    <td>{item.locationLabel ?? '-'}</td>
                    <td>
                      <StateLabel value={item.state} />
                    </td>
                    <td>
                      {item.sourceChangedAfterConfirmation
                        ? 'Calendar ต้นทางมีการเปลี่ยนแปลง'
                        : item.exceptionCode
                          ? (exceptionLabels[item.exceptionCode] ?? item.exceptionCode)
                          : '-'}
                    </td>
                    <td>
                      <WorklogReviewControls
                        id={item.id}
                        revision={item.revision}
                        state={item.state}
                        csrf={csrf}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มี Calendar Draft ในเดือนนี้</h2>
            <p>เพิ่ม IES Category ที่ Outlook Calendar แล้วซิงก์ ระบบจึงจะแสดงรายการใน Inbox</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
