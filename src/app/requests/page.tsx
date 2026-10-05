import {
  AirplaneTilt,
  ArrowCounterClockwise,
  CalendarCheck,
  CheckCircle,
  ClockCountdown,
  FileText,
  Plus,
  Receipt,
  Wallet,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { AppShell, Money, StateLabel } from '@/components/AppShell';
import { requireActor } from '@/server/auth-context';
import { employeeRequests } from '@/server/queries';

export const dynamic = 'force-dynamic';

const kindLabel = {
  leave: 'ลา',
  ot: 'OT',
  expense: 'ค่าใช้จ่าย',
  trip: 'เดินทาง',
  advance: 'เงินทดรอง',
} as const;

type RequestKind = keyof typeof kindLabel;

function RequestKindIcon({ kind, size = 16 }: { kind: RequestKind; size?: number }) {
  if (kind === 'leave') return <CalendarCheck size={size} weight="duotone" />;
  if (kind === 'ot') return <ClockCountdown size={size} weight="duotone" />;
  if (kind === 'expense') return <Receipt size={size} weight="duotone" />;
  if (kind === 'trip') return <AirplaneTilt size={size} weight="duotone" />;
  return <Wallet size={size} weight="duotone" />;
}

export default async function RequestsPage() {
  const actor = await requireActor();
  const requests = await employeeRequests(actor.id, 100);

  const draftCount = requests.filter((item) => item.workflowState === 'draft').length;
  const waitingCount = requests.filter((item) =>
    ['pending_head', 'pending_final'].includes(item.workflowState),
  ).length;
  const returnedCount = requests.filter(
    (item) => item.workflowState === 'returned' || item.financeState === 'returned',
  ).length;
  const approvedCount = requests.filter(
    (item) => item.workflowState === 'approved' && item.paymentState !== 'paid',
  ).length;
  const paidCount = requests.filter((item) => item.paymentState === 'paid').length;

  return (
    <AppShell
      actor={actor}
      title="คำขอของฉัน"
      description="ดูสถานะ ค้นหารายการที่ต้องดำเนินการ และสร้างคำขอใหม่"
    >
      <section className="request-summary-grid" aria-label="สรุปสถานะคำขอ">
        <article className="request-summary-card is-draft">
          <span className="request-summary-icon">
            <FileText size={20} weight="duotone" />
          </span>
          <span>
            <strong>{draftCount}</strong>
            <small>ร่าง</small>
          </span>
        </article>
        <article className="request-summary-card is-waiting">
          <span className="request-summary-icon">
            <ClockCountdown size={20} weight="duotone" />
          </span>
          <span>
            <strong>{waitingCount}</strong>
            <small>รออนุมัติ</small>
          </span>
        </article>
        <article className="request-summary-card is-returned">
          <span className="request-summary-icon">
            <ArrowCounterClockwise size={20} weight="duotone" />
          </span>
          <span>
            <strong>{returnedCount}</strong>
            <small>ถูกส่งกลับ</small>
          </span>
        </article>
        <article className="request-summary-card is-approved">
          <span className="request-summary-icon">
            <CheckCircle size={20} weight="duotone" />
          </span>
          <span>
            <strong>{approvedCount}</strong>
            <small>อนุมัติแล้ว</small>
          </span>
        </article>
        <article className="request-summary-card is-paid">
          <span className="request-summary-icon">
            <Wallet size={20} weight="duotone" />
          </span>
          <span>
            <strong>{paidCount}</strong>
            <small>จ่ายแล้ว</small>
          </span>
        </article>
      </section>

      <section className="section request-list-section">
        <div className="section-header">
          <div>
            <h2>คำขอทั้งหมด</h2>
            <p>{requests.length} รายการ · แสดงเฉพาะข้อมูลของคุณ</p>
          </div>
          <Link className="button button-primary request-new-button" href="/requests/new">
            <Plus size={16} weight="bold" />
            <span>สร้างคำขอใหม่</span>
          </Link>
        </div>
        {requests.length ? (
          <div className="data-table-wrap request-table-wrap" tabIndex={0}>
            <table className="data-table request-table">
              <caption className="sr-only">รายการคำขอของฉัน</caption>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ประเภท</th>
                  <th>เรื่อง</th>
                  <th>วันที่รายการ</th>
                  <th>อนุมัติ</th>
                  <th>การเงิน</th>
                  <th>การจ่าย</th>
                  <th className="amount">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="text-link" href={`/requests/${item.id}`}>
                        {item.reference}
                      </Link>
                    </td>
                    <td>
                      <span className={`request-kind-badge is-${item.kind}`}>
                        <RequestKindIcon kind={item.kind as RequestKind} />
                        <span>{kindLabel[item.kind]}</span>
                      </span>
                    </td>
                    <td>{item.title}</td>
                    <td>{item.businessDate}</td>
                    <td>
                      <StateLabel value={item.workflowState} />
                    </td>
                    <td>
                      {item.financeState === 'not_required' ? (
                        '-'
                      ) : (
                        <StateLabel value={item.financeState} />
                      )}
                    </td>
                    <td>
                      {item.paymentState === 'not_applicable' ? (
                        '-'
                      ) : (
                        <StateLabel value={item.paymentState} />
                      )}
                    </td>
                    <td className="amount">
                      {BigInt(item.totalSatang) > 0n ? <Money satang={item.totalSatang} /> : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มีคำขอ</h2>
            <p>สร้างคำขอใหม่เพื่อเริ่มต้น</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
