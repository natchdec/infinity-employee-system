'use client';

import { useMemo, useState, type FormEvent } from 'react';

interface CalendarPolicyView {
  version: number;
  effectiveFrom: string;
  body: {
    workingWeekdays: number[];
    holidays: string[];
    workStart?: string;
    workEnd?: string;
    lunchStart?: string;
    lunchEnd?: string;
    timeZone?: 'Asia/Bangkok';
  };
  hash: string;
}

const weekdayOptions = [
  [1, 'จันทร์'],
  [2, 'อังคาร'],
  [3, 'พุธ'],
  [4, 'พฤหัสบดี'],
  [5, 'ศุกร์'],
  [6, 'เสาร์'],
  [0, 'อาทิตย์'],
] as const;

async function post(csrf: string, body: unknown) {
  const response = await fetch('/api/admin/policies/calendar', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrf,
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? 'เผยแพร่นโยบายไม่สำเร็จ');
  return result;
}

function parseHolidayList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].sort();
}

export function CalendarPolicyAdminClient({
  csrf,
  today,
  current,
  history,
}: {
  csrf: string;
  today: string;
  current: CalendarPolicyView | null;
  history: CalendarPolicyView[];
}) {
  const defaultWeekdays = current?.body.workingWeekdays ?? [1, 2, 3, 4, 5];
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [workingWeekdays, setWorkingWeekdays] = useState<number[]>(defaultWeekdays);
  const [workStart, setWorkStart] = useState(current?.body.workStart ?? '09:00');
  const [workEnd, setWorkEnd] = useState(current?.body.workEnd ?? '18:00');
  const [lunchStart, setLunchStart] = useState(current?.body.lunchStart ?? '12:00');
  const [lunchEnd, setLunchEnd] = useState(current?.body.lunchEnd ?? '13:00');
  const [holidaysText, setHolidaysText] = useState((current?.body.holidays ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const selectedWeekdays = useMemo(() => new Set(workingWeekdays), [workingWeekdays]);

  function toggleWeekday(day: number) {
    setWorkingWeekdays((currentDays) =>
      currentDays.includes(day)
        ? currentDays.filter((item) => item !== day)
        : [...currentDays, day].sort((a, b) => a - b),
    );
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await post(csrf, {
        effectiveFrom,
        workingWeekdays,
        holidays: parseHolidayList(holidaysText),
        workStart,
        workEnd,
        lunchStart: lunchStart || null,
        lunchEnd: lunchEnd || null,
        timeZone: 'Asia/Bangkok',
      });
      setMessage('เผยแพร่ Working Schedule / Holiday version ใหม่แล้ว');
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'เผยแพร่นโยบายไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>Company Holiday / Working Schedule</h2>
          <p>
            กำหนดเวลาทำงานส่วนกลางและวันหยุดแบบ Versioned / Effective-Dated เพื่อให้ OT และ Payroll
            ใช้กฎตามวันที่ของรายการ
          </p>
        </div>
        {current ? <span className="state state-success">Current v{current.version}</span> : null}
      </div>

      {current ? (
        <dl className="detail-grid detail-grid-surface">
          <dt>มีผลตั้งแต่</dt>
          <dd>{current.effectiveFrom}</dd>
          <dt>เวลาทำงาน</dt>
          <dd>
            {current.body.workStart ?? '09:00'}–{current.body.workEnd ?? '18:00'}
          </dd>
          <dt>พักกลางวัน</dt>
          <dd>
            {current.body.lunchStart && current.body.lunchEnd
              ? `${current.body.lunchStart}–${current.body.lunchEnd}`
              : 'ไม่กำหนด'}
          </dd>
          <dt>วันหยุดที่กำหนด</dt>
          <dd>{current.body.holidays.length} วัน</dd>
        </dl>
      ) : (
        <div className="notice">
          <p>ยังไม่มี Calendar Policy ที่ Published กรุณาสร้างเวอร์ชันแรกก่อนใช้งานจริง</p>
        </div>
      )}

      <form className="admin-policy-form" onSubmit={(event) => void publish(event)}>
        <div className="form-grid">
          <label>
            <span>Effective Date</span>
            <input
              type="date"
              min={today}
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              required
            />
          </label>
          <label>
            <span>เริ่มงาน</span>
            <input
              type="time"
              value={workStart}
              onChange={(event) => setWorkStart(event.target.value)}
              required
            />
          </label>
          <label>
            <span>เลิกงาน</span>
            <input
              type="time"
              value={workEnd}
              onChange={(event) => setWorkEnd(event.target.value)}
              required
            />
          </label>
          <label>
            <span>พักเริ่ม</span>
            <input
              type="time"
              value={lunchStart}
              onChange={(event) => setLunchStart(event.target.value)}
            />
          </label>
          <label>
            <span>พักสิ้นสุด</span>
            <input
              type="time"
              value={lunchEnd}
              onChange={(event) => setLunchEnd(event.target.value)}
            />
          </label>
        </div>

        <fieldset className="admin-policy-weekdays">
          <legend>วันทำงาน</legend>
          {weekdayOptions.map(([day, label]) => (
            <label className="check-field" key={day}>
              <input
                type="checkbox"
                checked={selectedWeekdays.has(day)}
                onChange={() => toggleWeekday(day)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <label className="admin-policy-holidays">
          <span>Company Holidays (YYYY-MM-DD, หนึ่งวันต่อบรรทัด)</span>
          <textarea
            rows={8}
            value={holidaysText}
            onChange={(event) => setHolidaysText(event.target.value)}
            placeholder={'2026-10-13\n2026-12-05\n2026-12-31'}
          />
        </label>

        <div className="button-row">
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || workingWeekdays.length === 0}
          >
            {busy ? 'กำลังเผยแพร่…' : 'Publish new version'}
          </button>
          {message ? <span className="field-note">{message}</span> : null}
        </div>
      </form>

      {history.length ? (
        <div className="data-table-wrap" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Effective Date</th>
                <th>Working time</th>
                <th>Holidays</th>
                <th>Fingerprint</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.version}>
                  <td>v{item.version}</td>
                  <td>{item.effectiveFrom}</td>
                  <td>
                    {item.body.workStart ?? '09:00'}–{item.body.workEnd ?? '18:00'}
                  </td>
                  <td>{item.body.holidays.length}</td>
                  <td>
                    <code>{item.hash.slice(0, 16)}…</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
