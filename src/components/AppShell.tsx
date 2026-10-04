import { Bell, MagnifyingGlass } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { MobileNavigation, PrimaryNavigation } from '@/components/AppNavigation';
import { BrandLogo } from '@/components/BrandLogo';
import type { Actor } from '@/domain/core';

interface Props {
  actor: Actor;
  title: string;
  description?: string;
  hideHeader?: boolean;
  children: ReactNode;
}

function actorRoleLabel(actor: Actor) {
  if (actor.isHeadOwner) return 'Owner / Head';
  if (actor.roles.includes('finance_payer') && actor.roles.includes('admin'))
    return 'Finance Payer / Admin';
  if (actor.roles.includes('finance_payer')) return 'Finance Payer';
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

export function AppShell({ actor, title, description, hideHeader = false, children }: Props) {
  const roleLabel = actorRoleLabel(actor);

  return (
    <div className="app-shell v3-shell">
      <a className="skip-link" href="#main-content">
        ข้ามไปเนื้อหา
      </a>

      <aside className="sidebar v3-sidebar" aria-label="เมนูหลัก">
        <Link className="brand brand-lockup" href="/" aria-label="Infinity Employee System">
          <span className="brand-panel">
            <BrandLogo />
          </span>
          <span className="brand-system-name">Employee System</span>
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
        <header className="topbar v3-topbar">
          <form className="global-search" action="/projects" method="get" role="search">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input
              name="q"
              aria-label="ค้นหาโครงการ"
              placeholder="ค้นหาโครงการ, PO, ลูกค้า..."
              autoComplete="off"
            />
          </form>

          <div className="topbar-actions">
            <Link className="icon-button" href="/notifications" aria-label="การแจ้งเตือน">
              <Bell size={20} weight="regular" aria-hidden="true" />
            </Link>
            <Link className="topbar-account" href="/profile" aria-label="เปิดบัญชีของฉัน">
              <span className="avatar" aria-hidden="true">
                {initials(actor.displayName)}
              </span>
              <span className="topbar-account-copy">
                <strong>{actor.displayName}</strong>
                <span>{roleLabel}</span>
              </span>
              <span className="account-chevron" aria-hidden="true">
                ⌄
              </span>
            </Link>
          </div>
        </header>

        <main id="main-content" className="page v3-page">
          {!hideHeader ? (
            <header className="page-header v3-page-header">
              <div className="page-header-copy">
                <h1>{title}</h1>
                {description ? <p>{description}</p> : null}
              </div>
            </header>
          ) : null}
          {children}
        </main>
      </div>

      <MobileNavigation roles={actor.roles} />
    </div>
  );
}

export function Money({ satang }: { satang: string }) {
  const value = BigInt(satang);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return (
    <span className="money">
      {negative ? '-' : ''}
      {whole.toLocaleString('en-US')}.{fraction} บาท
    </span>
  );
}

const stateLabels: Record<string, string> = {
  draft: 'ร่าง',
  suggested: 'ระบบแนะนำ',
  confirmed: 'ยืนยันแล้ว',
  ignored: 'ไม่ใช้รายการนี้',
  submitted: 'สร้างคำขอแล้ว',
  exception: 'ต้องตรวจสอบ',
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
    value === 'approved' ||
    value === 'verified' ||
    value === 'paid' ||
    value === 'received' ||
    value === 'confirmed' ||
    value === 'submitted'
      ? 'success'
      : value === 'returned' || value === 'outstanding' || value === 'exception'
        ? 'warning'
        : value === 'rejected' || value === 'cancelled'
          ? 'danger'
          : 'neutral';
  return <span className={`state state-${semantic}`}>{stateLabels[value] ?? value}</span>;
}
