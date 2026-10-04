'use client';

import { useMemo, useState, type FormEvent } from 'react';

interface Obligation {
  id: string;
  ownerId: string;
  employeeName: string;
  reference: string;
  sourceKind: string;
  amountSatang: string;
}

interface Batch {
  id: string;
  reference: string;
  method: string;
  status: string;
  totalSatang: string;
  revision: number;
  itemCount: number;
}

function formatSatang(value: string): string {
  const amount = BigInt(value);
  return `${(amount / 100n).toLocaleString('en-US')}.${(amount % 100n).toString().padStart(2, '0')} บาท`;
}

export function PaymentBatchControls({
  csrf,
  actorId,
  canPay,
  obligations,
  batches,
}: {
  csrf: string;
  actorId: string;
  canPay: boolean;
  obligations: Obligation[];
  batches: Batch[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [method, setMethod] = useState<'petty_cash' | 'transfer'>('transfer');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const selectedRows = useMemo(
    () => obligations.filter((item) => selected.includes(item.id)),
    [obligations, selected],
  );
  const total = selectedRows.reduce((sum, item) => sum + BigInt(item.amountSatang), 0n);

  async function post(url: string, body: unknown) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf,
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message ?? 'ดำเนินการไม่สำเร็จ');
    window.location.reload();
  }

  async function create() {
    if (!selected.length) return;
    setBusy('create');
    setError('');
    try {
      await post('/api/finance/payment-batches', {
        method,
        obligationIds: selected,
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : 'สร้างชุดจ่ายไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function pay(batch: Batch) {
    if (!canPay) {
      setError('ต้องมีสิทธิ์ Finance Payer จึงจะยืนยันการจ่ายเงินได้');
      return;
    }
    const reference = window.prompt('เลขอ้างอิงการจ่ายภายนอก เช่น KBank / Petty Cash');
    if (!reference?.trim()) return;
    const paidDate = window.prompt(
      'วันที่จ่าย (YYYY-MM-DD)',
      new Date().toISOString().slice(0, 10),
    );
    if (!paidDate?.trim()) return;
    setBusy(batch.id);
    setError('');
    try {
      await post(`/api/finance/payment-batches/${batch.id}/commands`, {
        action: 'pay',
        expectedRevision: batch.revision,
        paidDate,
        externalReference: reference,
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : 'บันทึกการจ่ายไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function voidBatch(batch: Batch) {
    if (!window.confirm(`ยกเลิกชุดจ่าย ${batch.reference} และคืนรายการเข้า Ready to Pay?`)) return;
    setBusy(batch.id);
    setError('');
    try {
      await post(`/api/finance/payment-batches/${batch.id}/commands`, {
        action: 'void',
        expectedRevision: batch.revision,
      });
    } catch (value) {
      setError(value instanceof Error ? value.message : 'ยกเลิกชุดจ่ายไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="section">
        <div className="section-header">
          <div>
            <h2>พร้อมจ่าย</h2>
            <p>เลือกเฉพาะรายการที่คุณไม่ได้เป็นเจ้าของ ระบบจะตรวจ COI ซ้ำใน transaction</p>
          </div>
        </div>
        <div className="batch-toolbar">
          <label>
            <span>วิธีจ่าย</span>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as 'petty_cash' | 'transfer')}
            >
              <option value="transfer">Separate Transfer</option>
              <option value="petty_cash">Petty Cash</option>
            </select>
          </label>
          <div>
            <strong>{selected.length} รายการ</strong>
            <span>{formatSatang(total.toString())}</span>
          </div>
          <button
            className="button button-primary"
            disabled={!selected.length || Boolean(busy)}
            onClick={() => void create()}
          >
            สร้างชุดจ่าย
          </button>
        </div>
        {obligations.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <span className="sr-only">เลือก</span>
                  </th>
                  <th>อ้างอิง</th>
                  <th>พนักงาน</th>
                  <th>แหล่งรายการ</th>
                  <th className="amount">ยอด</th>
                  <th>ข้อควบคุม</th>
                </tr>
              </thead>
              <tbody>
                {obligations.map((item) => {
                  const own = item.ownerId === actorId;
                  return (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`เลือก ${item.reference}`}
                          disabled={own}
                          checked={selected.includes(item.id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id),
                            )
                          }
                        />
                      </td>
                      <td>{item.reference}</td>
                      <td>{item.employeeName}</td>
                      <td>{item.sourceKind}</td>
                      <td className="amount">{formatSatang(item.amountSatang)}</td>
                      <td>
                        {own ? (
                          <span className="state state-warning">รายการของคุณ</span>
                        ) : (
                          'พร้อมจัดชุด'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ไม่มีรายการพร้อมจ่าย</h2>
            <p>รายการที่ Finance verify แล้วจะปรากฏที่นี่</p>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Payment Batches</h2>
            <p>
              Finance จัดชุดจ่ายได้ แต่การยืนยัน Paid ต้องใช้สิทธิ์ Finance Payer
              และยังคงห้ามจ่ายรายการของตนเอง
            </p>
          </div>
        </div>
        {batches.length ? (
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>วิธี</th>
                  <th>สถานะ</th>
                  <th>รายการ</th>
                  <th className="amount">ยอด</th>
                  <th>คำสั่ง</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.reference}</td>
                    <td>{batch.method}</td>
                    <td>
                      <span
                        className={`state ${batch.status === 'paid' ? 'state-success' : batch.status === 'void' ? 'state-danger' : 'state-neutral'}`}
                      >
                        {batch.status}
                      </span>
                    </td>
                    <td>{batch.itemCount}</td>
                    <td className="amount">{formatSatang(batch.totalSatang)}</td>
                    <td>
                      {batch.status === 'ready' ? (
                        <div className="action-row">
                          <button
                            className="button button-primary"
                            disabled={Boolean(busy) || !canPay}
                            onClick={() => void pay(batch)}
                            title={canPay ? undefined : 'ต้องมีสิทธิ์ Finance Payer'}
                          >
                            ยืนยัน Paid
                          </button>
                          <button
                            className="button button-secondary"
                            disabled={Boolean(busy)}
                            onClick={() => void voidBatch(batch)}
                          >
                            ยกเลิก Batch
                          </button>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h2>ยังไม่มี Payment Batch</h2>
            <p>สร้างจากรายการ Ready to Pay ด้านบน</p>
          </div>
        )}
      </section>
    </>
  );
}

export function PayrollExportControls({ csrf, months }: { csrf: string; months: string[] }) {
  const [month, setMonth] = useState(months[0] ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(adapter: 'neutral_review_csv' | 'easy_acc') {
    if (!month) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/finance/exports/payroll', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ month, adapter }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'สร้าง export ไม่สำเร็จ');
      setMessage(
        result.export.state === 'blocked'
          ? result.export.blockedReason
          : `สร้าง Review CSV แล้ว · SHA256 ${result.export.artifactSha256}`,
      );
      window.setTimeout(() => window.location.reload(), 700);
    } catch (value) {
      setMessage(value instanceof Error ? value.message : 'สร้าง export ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="export-control">
      <label>
        <span>Payroll cycle</span>
        <select value={month} onChange={(event) => setMonth(event.target.value)}>
          {months.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button button-primary"
        disabled={!month || busy}
        onClick={() => void create('neutral_review_csv')}
      >
        สร้าง Review CSV
      </button>
      <button
        className="button button-secondary"
        disabled={!month || busy}
        onClick={() => void create('easy_acc')}
      >
        สถานะ EASY-ACC Direct Integration
      </button>
      {message ? <p className="field-note">{message}</p> : null}
    </div>
  );
}

export function AccountingExportControls({ csrf }: { csrf: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(adapter: 'neutral_review_csv' | 'smartbiz') {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/finance/exports/accounting', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ from, to, adapter }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'สร้าง export ไม่สำเร็จ');
      setMessage(
        result.export.state === 'blocked'
          ? result.export.blockedReason
          : `สร้าง Review CSV แล้ว · SHA256 ${result.export.artifactSha256}`,
      );
      window.setTimeout(() => window.location.reload(), 700);
    } catch (value) {
      setMessage(value instanceof Error ? value.message : 'สร้าง export ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="export-control" onSubmit={(event: FormEvent) => event.preventDefault()}>
      <label>
        <span>จากวันที่</span>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      </label>
      <label>
        <span>ถึงวันที่</span>
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </label>
      <button
        className="button button-primary"
        disabled={busy}
        onClick={() => void create('neutral_review_csv')}
      >
        สร้าง Review CSV
      </button>
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={() => void create('smartbiz')}
      >
        สถานะ Smartbiz Desktop Bridge
      </button>
      {message ? <p className="field-note">{message}</p> : null}
    </form>
  );
}
