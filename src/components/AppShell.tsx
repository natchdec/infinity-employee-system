import Link from 'next/link';
import type { ReactNode } from 'react';
import { MobileNavigation, PrimaryNavigation } from '@/components/AppNavigation';
import type { Actor } from '@/domain/core';

interface Props {
  actor: Actor;
  title: string;
  description?: string;
  children: ReactNode;
}

function actorRoleLabel(actor: Actor) {
  if (actor.isHeadOwner) return 'Owner / Head';
  if (actor.roles.includes('finance') && actor.roles.includes('admin')) return 'Finance / Admin';
  if (actor.roles.includes('finance')) return 'Finance';
  if (actor.roles.includes('admin')) return 'Admin';
  if (actor.roles.includes('head')) return 'Head';
  return 'Employee';
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? '')
    .join('')
    .toUpperCase();
}

export function AppShell({ actor, title, description, children }: Props) {
  const roleLabel = actorRoleLabel(actor);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        ข้ามไปเนื้อหา
      </a>

      <aside className="sidebar" aria-label="เมนูหลัก">
        <Link className="brand" href="/">
          <span className="brand-rail" aria-hidden="true" />
          <span className="brand-copy">
            <span className="brand-mark">INFINITY</span>
            <span className="brand-product">People Operations</span>
          </span>
        </Link>

        <PrimaryNavigation roles={actor.roles} />

        <Link className="sidebar-identity" href="/profile">
          <span className="avatar avatar-small" aria-hidden="true">
            {initials(actor.displayName)}
          </span>
          <span className="sidebar-identity-copy">
            <strong>{actor.displayName}</strong>
            <span>{roleLabel}</span>
          </span>
        </Link>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-context" aria-label="บริบทการทำงาน">
            <span className="topbar-company">Infinity Solution Service</span>
            <span className="topbar-separator" aria-hidden="true" />
            <span className="topbar-role">{roleLabel}</span>
          </div>

          <Link className="topbar-account" href="/profile" aria-label="เปิดบัญชีของฉัน">
            <span className="avatar" aria-hidden="true">
              {initials(actor.displayName)}
            </span>
            <span className="topbar-account-copy">
              <strong>{actor.displayName}</strong>
              <span>{actor.email}</span>
            </span>
          </Link>
        </header>

        <main id="main-content" className="page">
          <header className="page-header">
            <div className="page-header-copy">
              <span className="page-kicker">EMPLOYEE WORKSPACE</span>
              <h1>{title}</h1>
              {description ? <p>{description}</p> : null}
            </div>
          </header>
          {children}
        </main>
      </div>

      <MobileNavigation />
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
