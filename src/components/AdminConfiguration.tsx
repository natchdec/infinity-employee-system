'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

const adminSections = [
  ['/admin', 'ภาพรวม'],
  ['/admin/employees', 'พนักงานและสิทธิ์'],
  ['/admin/directory', 'Microsoft 365 Directory'],
  ['/admin/organization', 'โครงสร้างองค์กร'],
  ['/admin/approval-rules', 'Approval Rules'],
  ['/admin/policies', 'Policy Center'],
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
        <div className="section-header">
          <div>
            <h2>Approval matrix</h2>
            <p>เส้นทางอนุมัติที่ใช้จริงแยกตามประเภทคำขอ</p>
          </div>
          <span className="state state-success">Policy v{current.version}</span>
        </div>
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
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>{row.manager}</td>
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
            <dd>Line Head</dd>
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
              <h2>Published history</h2>
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
