'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface ApprovalRuleRow {
  kind: string;
  label: string;
  manager: string;
  finance: string;
  destination: string;
}

interface ApprovalPolicyView {
  version: number;
  effectiveFrom: string;
  body: {
    manager: 'line_head';
    ownerHeadSkip: true;
    financeIndependent: true;
    projectManagerApproval: false;
  };
  hash: string;
}

interface ApprovalRouteRow {
  routeKey:
    'leave' | 'ot' | 'expense_travel' | 'expense_other' | 'expense_mixed' | 'trip' | 'advance';
  label: string;
  version: number;
  effectiveFrom: string;
  mode: 'line_head' | 'specific_employee';
  approverEmployeeId: string | null;
  approverName: string | null;
}

interface ApprovalApproverOption {
  id: string;
  displayName: string;
  email: string;
}

const adminSections = [
  ['/admin', 'ภาพรวม'],
  ['/admin/employees', 'พนักงานและสิทธิ์'],
  ['/admin/directory', 'Microsoft 365 Directory'],
  ['/admin/organization', 'โครงสร้างองค์กร'],
  ['/admin/approval-rules', 'Approval Rules'],
  ['/admin/policies', 'Policy Center'],
  ['/admin/integrations/projects', 'Project Integration'],
] as const;

export function AdminSectionNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-subnav" aria-label="การตั้งค่าระบบ">
      {adminSections.map(([href, label]) => {
        const active =
          href === '/admin'
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link href={href} key={href} aria-current={active ? 'page' : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function bangkokToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function saveApprovalRoute(
  csrf: string,
  body: {
    routeKey: ApprovalRouteRow['routeKey'];
    effectiveFrom: string;
    mode: ApprovalRouteRow['mode'];
    approverEmployeeId: string | null;
  },
) {
  const response = await fetch('/api/admin/approval-routes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrf,
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message ?? 'บันทึกผู้อนุมัติไม่สำเร็จ');
  return result;
}

function ApprovalRouteEditor({
  csrf,
  route,
  approvers,
}: {
  csrf: string;
  route: ApprovalRouteRow;
  approvers: ApprovalApproverOption[];
}) {
  const [mode, setMode] = useState<ApprovalRouteRow['mode']>(route.mode);
  const [approverId, setApproverId] = useState(route.approverEmployeeId ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(bangkokToday());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await saveApprovalRoute(csrf, {
        routeKey: route.routeKey,
        effectiveFrom,
        mode,
        approverEmployeeId: mode === 'specific_employee' ? approverId || null : null,
      });
      setMessage('บันทึก route version ใหม่แล้ว');
      window.setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกผู้อนุมัติไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="approval-route-editor">
      <select
        value={mode}
        onChange={(event) => setMode(event.target.value as ApprovalRouteRow['mode'])}
      >
        <option value="line_head">ตาม Line Head ของผู้ขอ</option>
        <option value="specific_employee">กำหนดผู้อนุมัติเฉพาะ</option>
      </select>

      {mode === 'specific_employee' ? (
        <select value={approverId} onChange={(event) => setApproverId(event.target.value)} required>
          <option value="">เลือก Head / Owner...</option>
          {approvers.map((person) => (
            <option value={person.id} key={person.id}>
              {person.displayName} · {person.email}
            </option>
          ))}
        </select>
      ) : (
        <span className="muted">ใช้ Reporting Line ของพนักงาน</span>
      )}

      <input
        aria-label="วันที่เริ่มใช้"
        type="date"
        min={bangkokToday()}
        value={effectiveFrom}
        onChange={(event) => setEffectiveFrom(event.target.value)}
      />

      <button
        type="button"
        className="button button-secondary"
        disabled={busy || (mode === 'specific_employee' && !approverId)}
        onClick={() => void save()}
      >
        {busy ? 'กำลังบันทึก…' : 'ใช้ค่านี้'}
      </button>

      {message ? <span className="field-note">{message}</span> : null}
    </div>
  );
}

export function ApprovalRulesPanel({
  csrf,
  current,
  history,
  rows,
  routes,
  approvers,
}: {
  csrf: string;
  current: ApprovalPolicyView;
  history: ApprovalPolicyView[];
  rows: ApprovalRuleRow[];
  routes: ApprovalRouteRow[];
  approvers: ApprovalApproverOption[];
}) {
  return (
    <>
      <section className="section">
        <div className="notice">
          <p>
            Approval Policy v{current.version} มีผล {current.effectiveFrom}. Admin
            สามารถกำหนดผู้อนุมัติแยกตามประเภทงานได้ โดยเลือกใช้ Line Head หรือ Head / Owner
            คนใดคนหนึ่งแบบ Effective-Dated และเก็บประวัติทุกเวอร์ชัน. Head / Owner
            ที่ยื่นคำขอของตนเองยังคง SYSTEM_SKIPPED และ Finance ยังบังคับคนละคนกับผู้ขอ.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>ผู้อนุมัติแยกตามประเภท</h2>
            <p>
              แยก OT, ลา, ค่าเดินทาง, ค่าใช้จ่ายอื่น, Trip และเงินทดรองได้คนละคน
              การเปลี่ยนค่ามีผลกับคำขอใหม่หลัง Effective Date เท่านั้น
            </p>
          </div>
          <span className="state state-success">Configurable routing</span>
        </div>

        <div className="approval-route-list">
          {routes.map((route) => (
            <article className="approval-route-row" key={route.routeKey}>
              <div className="approval-route-current">
                <strong>{route.label}</strong>
                <span>
                  ปัจจุบัน:{' '}
                  {route.mode === 'line_head'
                    ? 'Line Head'
                    : (route.approverName ?? 'Specific approver')}
                </span>
                <small>
                  v{route.version} · มีผล {route.effectiveFrom}
                </small>
              </div>
              <ApprovalRouteEditor csrf={csrf} route={route} approvers={approvers} />
            </article>
          ))}
        </div>

        <p className="field-note">
          ค่าเดินทาง / ที่พัก = รถส่วนตัว, Taxi, Grab, Toll, Parking, Rental Car, Fuel, Hotel ·
          ค่าใช้จ่ายอื่น = Entertainment / Other · ถ้าคำขอเดียวมีทั้งสองกลุ่ม จะใช้ route “Expense
          แบบผสม”
        </p>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2>Approval matrix</h2>
            <p>ขั้นหลัง Manager approval ยังคงแยกตามประเภทคำขอ</p>
          </div>
          <span className="state state-success">Policy v{current.version}</span>
        </div>
        <div className="data-table-wrap" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>Manager step</th>
                <th>Finance</th>
                <th>ปลายทางหลังอนุมัติ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.kind}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>Configurable route</td>
                  <td>{row.finance}</td>
                  <td>{row.destination}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section admin-rule-grid">
        <div>
          <div className="section-header">
            <div>
              <h2>ข้อควบคุมที่บังคับใช้</h2>
              <p>Guardrail เหล่านี้ไม่สามารถ bypass ผ่านหน้า Admin ได้</p>
            </div>
          </div>
          <dl className="detail-grid detail-grid-surface">
            <dt>Manager routing</dt>
            <dd>Line Head หรือ Specific Head / Owner ตาม route</dd>
            <dt>Head / Owner self-request</dt>
            <dd>{current.body.ownerHeadSkip ? 'SYSTEM_SKIPPED' : 'ไม่ข้าม'}</dd>
            <dt>Finance independence</dt>
            <dd>{current.body.financeIndependent ? 'บังคับคนละคนกับผู้ขอ' : 'ไม่บังคับ'}</dd>
            <dt>Project Manager</dt>
            <dd>{current.body.projectManagerApproval ? 'ใช้' : 'ไม่ใช้'}</dd>
          </dl>
        </div>
        <div>
          <div className="section-header">
            <div>
              <h2>Published policy history</h2>
              <p>ทุกเวอร์ชันเก็บ fingerprint เพื่อ audit ย้อนหลัง</p>
            </div>
          </div>
          <div className="data-table-wrap" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Effective from</th>
                  <th>Fingerprint</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.version}>
                    <td>v{item.version}</td>
                    <td>{item.effectiveFrom}</td>
                    <td>
                      <code>{item.hash.slice(0, 16)}…</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
