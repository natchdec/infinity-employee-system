'use client';

import Link from 'next/link';

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

export function AdminSectionNav() {
  return (
    <nav className="admin-subnav" aria-label="การตั้งค่าระบบ">
      <Link href="/admin">ภาพรวม</Link>
      <Link href="/admin/employees">พนักงานและสิทธิ์</Link>
      <Link href="/admin/organization">โครงสร้างองค์กร</Link>
      <Link href="/admin/approval-rules">Approval Rules</Link>
    </nav>
  );
}

export function ApprovalRulesPanel({
  current,
  history,
  rows,
}: {
  current: ApprovalPolicyView;
  history: ApprovalPolicyView[];
  rows: ApprovalRuleRow[];
}) {
  return (
    <>
      <section className="section">
        <div className="notice">
          <p>
            Approval Policy v{current.version} มีผล {current.effectiveFrom}. กฎควบคุมหลักถูกล็อกตาม
            SOT: Line Head เท่านั้น, Head/Owner ข้ามขั้นของตนเองแบบ SYSTEM_SKIPPED, Finance
            ต้องเป็นคนอื่น และไม่มี Project Manager approval.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="data-table-wrap" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ประเภท</th>
                <th>Manager</th>
                <th>Finance</th>
                <th>ปลายทางหลังอนุมัติ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.kind}>
                  <td>{row.label}</td>
                  <td>{row.manager}</td>
                  <td>{row.finance}</td>
                  <td>{row.destination}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="section">
        <h2>ข้อควบคุมที่บังคับใช้</h2>
        <dl className="detail-grid">
          <dt>Manager routing</dt>
          <dd>Line Head</dd>
          <dt>Head / Owner self-request</dt>
          <dd>{current.body.ownerHeadSkip ? 'SYSTEM_SKIPPED' : 'ไม่ข้าม'}</dd>
          <dt>Finance independence</dt>
          <dd>{current.body.financeIndependent ? 'บังคับคนละคนกับผู้ขอ' : 'ไม่บังคับ'}</dd>
          <dt>Project Manager</dt>
          <dd>{current.body.projectManagerApproval ? 'ใช้' : 'ไม่ใช้'}</dd>
        </dl>
      </section>
      <section className="section">
        <h2>Published history</h2>
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
      </section>
    </>
  );
}
