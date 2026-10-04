'use client';

import { useState } from 'react';

interface RequestSummary {
  id: string;
  employeeId: string;
  assignedHeadId: string | null;
  kind: string;
  revision: number;
  workflowState: string;
  financeState: string;
  paymentState: string;
}

interface SettlementSummary {
  id: string;
  state: string;
  revision: number;
}

interface Props {
  csrf: string;
  actorId: string;
  roles: string[];
  request: RequestSummary;
  originalReceipt: { state: string; revision: number } | null;
  settlement: SettlementSummary | null;
  settlementCanStart: boolean;
  canHeadDecide?: boolean;
}

export function RequestActions({
  csrf,
  actorId,
  roles,
  request,
  originalReceipt,
  settlement,
  settlementCanStart,
  canHeadDecide = false,
}: Props) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const owner = request.employeeId === actorId;
  const isHead =
    roles.includes('head') && !owner && (canHeadDecide || request.assignedHeadId === actorId);
  const isFinance = roles.includes('finance') && !owner;

  async function command(action: string, extra: Record<string, unknown> = {}) {
    const reason =
      action === 'return' ||
      action === 'reject' ||
      action === 'finance_return' ||
      action === 'cancel'
        ? window.prompt('ระบุเหตุผล')
        : null;
    if (
      (action === 'return' ||
        action === 'reject' ||
        action === 'finance_return' ||
        action === 'cancel') &&
      !reason?.trim()
    )
      return;
    setBusy(action);
    setError('');
    try {
      const response = await fetch(`/api/requests/${request.id}/commands`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          action,
          expectedRevision: request.revision,
          ...(reason ? { reason } : {}),
          ...extra,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'ดำเนินการไม่สำเร็จ');
      window.location.reload();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function submitSettlement() {
    setBusy('settlement');
    setError('');
    try {
      const response = await fetch(`/api/trips/${request.id}/settlement`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: '{}',
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result?.error?.message ?? 'เริ่มเคลียร์ค่าใช้จ่ายไม่สำเร็จ');
      window.location.reload();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  async function settlementCommand(action: 'verify' | 'refund_received') {
    if (!settlement) return;
    const externalReference =
      action === 'refund_received' ? window.prompt('เลขอ้างอิงการรับเงินคืน') : null;
    if (action === 'refund_received' && !externalReference?.trim()) return;
    setBusy(`settlement_${action}`);
    setError('');
    try {
      const response = await fetch(`/api/finance/settlements/${settlement.id}/commands`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          action,
          expectedRevision: settlement.revision,
          ...(externalReference ? { externalReference } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? 'ดำเนินการ settlement ไม่สำเร็จ');
      window.location.reload();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  const cancellable =
    owner &&
    ['pending_head', 'approved', 'returned'].includes(request.workflowState) &&
    request.financeState !== 'verified' &&
    !['allocated', 'paid'].includes(request.paymentState);

  return (
    <section className="section action-section" aria-labelledby="action-title">
      <div className="section-header">
        <div>
          <h2 id="action-title">การดำเนินการ</h2>
          <p>ทุกคำสั่งตรวจ revision และ idempotency ที่ฝั่งเซิร์ฟเวอร์</p>
        </div>
      </div>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="action-row">
        {isHead && request.workflowState === 'pending_head' ? (
          <>
            <button
              className="button button-approve"
              disabled={Boolean(busy)}
              onClick={() => void command('approve')}
            >
              อนุมัติ
            </button>
            <button
              className="button button-return"
              disabled={Boolean(busy)}
              onClick={() => void command('return')}
            >
              ส่งกลับแก้ไข
            </button>
            <button
              className="button button-reject"
              disabled={Boolean(busy)}
              onClick={() => void command('reject')}
            >
              ไม่อนุมัติ
            </button>
          </>
        ) : null}

        {isFinance && request.financeState === 'pending' ? (
          <>
            <button
              className="button button-primary"
              disabled={Boolean(busy)}
              onClick={() => void command('finance_verify')}
            >
              ตรวจสอบการเงิน
            </button>
            <button
              className="button button-secondary"
              disabled={Boolean(busy)}
              onClick={() => void command('finance_return')}
            >
              ส่งกลับแก้ไข
            </button>
          </>
        ) : null}

        {isFinance && originalReceipt?.state === 'outstanding' ? (
          <button
            className="button button-secondary"
            disabled={Boolean(busy)}
            onClick={() =>
              void command('original_received', { expectedRevision: originalReceipt.revision })
            }
          >
            รับใบเสร็จต้นฉบับแล้ว
          </button>
        ) : null}

        {cancellable ? (
          <button
            className="button button-danger"
            disabled={Boolean(busy)}
            onClick={() => void command('cancel')}
          >
            ยกเลิกคำขอ
          </button>
        ) : null}

        {owner &&
        request.kind === 'trip' &&
        request.workflowState === 'approved' &&
        settlementCanStart &&
        !settlement ? (
          <button
            className="button button-primary"
            disabled={Boolean(busy)}
            onClick={() => void submitSettlement()}
          >
            เริ่มเคลียร์ค่าใช้จ่าย
          </button>
        ) : null}

        {isFinance && settlement?.state === 'submitted' ? (
          <button
            className="button button-primary"
            disabled={Boolean(busy)}
            onClick={() => void settlementCommand('verify')}
          >
            ตรวจสอบ Settlement
          </button>
        ) : null}

        {isFinance && settlement?.state === 'refund_due' ? (
          <button
            className="button button-primary"
            disabled={Boolean(busy)}
            onClick={() => void settlementCommand('refund_received')}
          >
            ยืนยันรับเงินคืน
          </button>
        ) : null}
      </div>
    </section>
  );
}
