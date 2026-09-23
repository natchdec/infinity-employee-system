import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Actor } from '@/domain/core';

interface Props {
  actor: Actor;
  title: string;
  description?: string;
  children: ReactNode;
}

const employeeNav = [
  ['/', 'หน้าแรก'],
  ['/requests', 'รายการของฉัน'],
  ['/requests/new', 'สร้างคำขอ'],
  ['/trips', 'การเดินทาง'],
  ['/profile', 'โปรไฟล์'],
] as const;

export function AppShell({ actor, title, description, children }: Props) {
  const workNav: [string, string][] = [];
  if (actor.roles.includes('head')) workNav.push(['/approvals', 'รออนุมัติ']);
  if (actor.roles.includes('finance')) workNav.push(['/finance', 'งานการเงิน']);
  if (actor.roles.includes('admin')) workNav.push(['/admin', 'จัดการระบบ']);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        ข้ามไปเนื้อหา
      </a>
      <aside className="sidebar" aria-label="เมนูหลัก">
        <Link className="brand" href="/">
          <span className="brand-mark">INFINITY</span>
          <span className="brand-product">Employee</span>
        </Link>
        <nav className="nav-group" aria-label="เมนูพนักงาน">
          <p className="nav-label">ส่วนตัว</p>
          {employeeNav.map(([href, label]) => (
            <Link className="nav-link" href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        {workNav.length > 0 ? (
          <nav className="nav-group" aria-label="เมนูงานตามบทบาท">
            <p className="nav-label">งานตามบทบาท</p>
            {workNav.map(([href, label]) => (
              <Link className="nav-link" href={href} key={href}>
                {label}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="sidebar-identity">
          <strong>{actor.displayName}</strong>
          <span>{actor.email}</span>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div>
            <p className="topbar-company">Infinity Solution Service</p>
            <p className="topbar-role">
              {actor.isHeadOwner
                ? 'Owner / Head'
                : actor.roles.includes('finance')
                  ? 'Finance / Admin'
                  : 'Employee'}
            </p>
          </div>
          <Link className="text-link" href="/profile">
            บัญชีของฉัน
          </Link>
        </header>

        <main id="main-content" className="page">
          <header className="page-header">
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
          </header>
          {children}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="เมนูมือถือ">
        {employeeNav.slice(0, 4).map(([href, label]) => (
          <Link href={href} key={href}>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Money({ satang }: { satang: string }) {
  const value = BigInt(satang);
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, '0');
  return (
    <span className="money">
      {whole.toLocaleString('en-US')}.{fraction} บาท
    </span>
  );
}

const stateLabels: Record<string, string> = {
  draft: 'ร่าง',
  pending_head: 'รอหัวหน้าอนุมัติ',
  approved: 'อนุมัติแล้ว',
  returned: 'ส่งกลับแก้ไข',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิก',
  pending: 'รอตรวจสอบการเงิน',
  verified: 'ตรวจสอบแล้ว',
  unpaid: 'รอจ่าย',
  allocated: 'อยู่ในชุดจ่าย',
  paid: 'จ่ายแล้ว',
  outstanding: 'รอต้นฉบับ',
  received: 'ได้รับต้นฉบับแล้ว',
};

export function StateLabel({ value }: { value: string }) {
  const semantic =
    value === 'approved' || value === 'verified' || value === 'paid' || value === 'received'
      ? 'success'
      : value === 'returned' || value === 'outstanding'
        ? 'warning'
        : value === 'rejected' || value === 'cancelled'
          ? 'danger'
          : 'neutral';
  return <span className={`state state-${semantic}`}>{stateLabels[value] ?? value}</span>;
}
