import Link from 'next/link';
import type { Json } from '@/domain/core';
import type { RequestDetail } from '@/server/request-view';
import { Money, StateLabel } from '../AppShell';

function obj(value: Json | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function arr(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: Json | undefined): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: Json | undefined): number {
  return typeof value === 'number' ? value : 0;
}

function documentIds(payload: Record<string, Json>): string[] {
  const ids = new Set<string>();
  for (const value of arr(payload.documentIds)) if (typeof value === 'string') ids.add(value);
  for (const line of arr(payload.lines)) {
    for (const value of arr(obj(line).documentIds)) if (typeof value === 'string') ids.add(value);
  }
  return [...ids];
}

export function RequestSummary({ detail }: { detail: RequestDetail }) {
  const { request, calculation, payload } = detail;
  const docs = documentIds(payload);
  const lines = arr(calculation.lines);

  return (
    <>
      <section className="section">
        <dl className="detail-grid">
          <dt>เลขที่</dt>
          <dd>{request.reference}</dd>
          <dt>พนักงาน</dt>
          <dd>{request.employeeName}</dd>
          <dt>วันที่รายการ</dt>
          <dd>{request.business_date}</dd>
          <dt>รอบแก้ไข</dt>
          <dd>{request.submission_round}</dd>
          <dt>อนุมัติ</dt>
          <dd>
            <StateLabel value={request.workflow_state} />
          </dd>
          <dt>การเงิน</dt>
          <dd>
            {request.finance_state === 'not_required' ? (
              '-'
            ) : (
              <StateLabel value={request.finance_state} />
            )}
          </dd>
          <dt>การจ่าย</dt>
          <dd>
            {request.payment_state === 'not_applicable' ? (
              '-'
            ) : (
              <StateLabel value={request.payment_state} />
            )}
          </dd>
          <dt>ยอด</dt>
          <dd>
            {BigInt(request.total_satang) > 0n ? <Money satang={request.total_satang} /> : '-'}
          </dd>
        </dl>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>ข้อมูลและการคำนวณ</h2>
            <p>ค่าที่ใช้อนุมัติถูก freeze ตาม request revision และ policy snapshot</p>
          </div>
        </div>

        {request.kind === 'leave' ? (
          <dl className="detail-grid">
            <dt>ประเภท</dt>
            <dd>{stringValue(calculation.label)}</dd>
            <dt>จำนวนวัน</dt>
            <dd>{numberValue(calculation.days)} วัน</dd>
            <dt>วันที่ได้รับค่าจ้าง</dt>
            <dd>{numberValue(calculation.paidDays)} วัน</dd>
            <dt>วันที่ไม่รับค่าจ้าง</dt>
            <dd>{numberValue(calculation.unpaidDays)} วัน</dd>
            <dt>วิธีนับ</dt>
            <dd>{stringValue(calculation.counting)}</dd>
          </dl>
        ) : null}

        {request.kind === 'ot' ? (
          <>
            <dl className="detail-grid">
              <dt>ชั่วโมงรวม</dt>
              <dd>{numberValue(calculation.totalHours)} ชั่วโมง</dd>
              <dt>ยอด OT</dt>
              <dd>
                <Money satang={stringValue(calculation.totalSatang) || '0'} />
              </dd>
            </dl>
            <div className="data-table-wrap" tabIndex={0}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ประเภท</th>
                    <th>ชั่วโมง</th>
                    <th>ตัวคูณ</th>
                    <th className="amount">ยอด</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((value, index) => {
                    const line = obj(value);
                    return (
                      <tr key={index}>
                        <td>{stringValue(line.label)}</td>
                        <td>{numberValue(line.hours)}</td>
                        <td>{(numberValue(line.multiplierBasisPoints) / 10000).toFixed(1)}x</td>
                        <td className="amount">
                          <Money satang={stringValue(line.amountSatang) || '0'} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {request.kind === 'expense' ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ประเภท</th>
                  <th>วันที่</th>
                  <th>รายละเอียด</th>
                  <th className="amount">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((value, index) => {
                  const line = obj(value);
                  return (
                    <tr key={index}>
                      <td>{stringValue(line.categoryLabel)}</td>
                      <td>{stringValue(line.date)}</td>
                      <td>{stringValue(line.description)}</td>
                      <td className="amount">
                        <Money satang={stringValue(line.amountSatang) || '0'} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {request.kind === 'trip'
          ? (() => {
              const perDiem = obj(calculation.perDiem);
              return (
                <dl className="detail-grid">
                  <dt>ปลายทาง</dt>
                  <dd>{stringValue(payload.destination)}</dd>
                  <dt>ช่วงเดินทาง</dt>
                  <dd>
                    {stringValue(payload.start)} – {stringValue(payload.end)}
                  </dd>
                  <dt>เบี้ยเลี้ยง</dt>
                  <dd>
                    <Money satang={stringValue(perDiem.totalSatang) || '0'} />
                  </dd>
                  <dt>จำนวนวัน</dt>
                  <dd>{numberValue(perDiem.days)} วัน</dd>
                  <dt>กำหนดเคลียร์</dt>
                  <dd>{stringValue(calculation.dueDate)}</dd>
                  <dt>ประมาณการรวม</dt>
                  <dd>
                    <Money satang={stringValue(calculation.totalEstimateSatang) || '0'} />
                  </dd>
                </dl>
              );
            })()
          : null}

        {request.kind === 'advance' ? (
          <dl className="detail-grid">
            <dt>เงินทดรอง</dt>
            <dd>
              <Money satang={request.total_satang} />
            </dd>
            <dt>ทริปหลัก</dt>
            <dd>{request.parent_trip_id ? 'ผูกกับทริปแล้ว' : '-'}</dd>
          </dl>
        ) : null}
      </section>

      {docs.length ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>หลักฐาน</h2>
              <p>เปิดผ่าน authorization ของระบบเท่านั้น</p>
            </div>
          </div>
          <ul className="document-links">
            {docs.map((id, index) => (
              <li key={id}>
                <a
                  className="text-link"
                  href={`/api/documents/${id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  หลักฐาน {index + 1}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {detail.originalReceipt ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>ใบเสร็จต้นฉบับ</h2>
            </div>
          </div>
          <p>
            <StateLabel value={detail.originalReceipt.state} />
          </p>
        </section>
      ) : null}

      {detail.settlement ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Settlement</h2>
              <p>การเคลียร์เงินทดรองกับค่าใช้จ่ายจริง</p>
            </div>
          </div>
          <dl className="detail-grid">
            <dt>สถานะ</dt>
            <dd>{detail.settlement.state}</dd>
            <dt>Actual</dt>
            <dd>
              <Money satang={detail.settlement.actualSatang} />
            </dd>
            <dt>Advance ที่จ่ายแล้ว</dt>
            <dd>
              <Money satang={detail.settlement.paidAdvanceSatang} />
            </dd>
            <dt>Net</dt>
            <dd>
              <Money satang={detail.settlement.netSatang} />
            </dd>
            <dt>กำหนด</dt>
            <dd>{detail.settlement.dueDate}</dd>
          </dl>
        </section>
      ) : null}

      <section className="section">
        <div className="section-header">
          <div>
            <h2>ประวัติ</h2>
            <p>เหตุการณ์อนุมัติเป็น append-only</p>
          </div>
        </div>
        <ol className="timeline">
          {detail.actions.map((action, index) => (
            <li key={`${action.occurredAt}-${index}`}>
              <strong>{action.action}</strong>
              <span>
                {action.actorName ?? 'ระบบ'} · {new Date(action.occurredAt).toLocaleString('th-TH')}
              </span>
              {action.reason ? <p>{action.reason}</p> : null}
            </li>
          ))}
        </ol>
      </section>

      {request.workflow_state === 'returned' ? (
        <p>
          <Link className="button button-primary" href={`/requests/${request.id}/edit`}>
            แก้ไขและส่งใหม่
          </Link>
        </p>
      ) : null}
    </>
  );
}
