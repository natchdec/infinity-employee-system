'use client';

import {
  AirplaneTilt,
  Bell,
  CalendarDots,
  ChartBar,
  Checks,
  ClockCounterClockwise,
  FileText,
  GearSix,
  House,
  PlusSquare,
  Receipt,
  UserCircle,
  Wallet,
  WarningCircle,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/domain/core';

type NavIcon =
  | 'home'
  | 'requests'
  | 'new'
  | 'trips'
  | 'profile'
  | 'projects'
  | 'approvals'
  | 'finance'
  | 'admin'
  | 'worklog'
  | 'attention'
  | 'notifications'
  | 'receipts'
  | 'statement'
  | 'audit';

interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

const employeeNav: NavItem[] = [
  { href: '/', label: 'หน้าแรก', icon: 'home' },
  { href: '/requests', label: 'รายการของฉัน', icon: 'requests' },
  { href: '/requests/new', label: 'สร้างคำขอ', icon: 'new' },
  { href: '/trips', label: 'การเดินทาง', icon: 'trips' },
  { href: '/profile', label: 'โปรไฟล์', icon: 'profile' },
  { href: '/projects', label: 'โครงการ', icon: 'projects' },
];

const operationsNav: NavItem[] = [
  { href: '/worklog', label: 'Calendar Inbox', icon: 'worklog' },
  { href: '/exceptions', label: 'Needs Attention', icon: 'attention' },
  { href: '/notifications', label: 'การแจ้งเตือน', icon: 'notifications' },
  { href: '/receipts', label: 'Receipt Inbox', icon: 'receipts' },
  { href: '/statement', label: 'สรุปรายเดือน', icon: 'statement' },
  { href: '/audit', label: 'Audit Timeline', icon: 'audit' },
];

function Icon({ name, size = 19 }: { name: NavIcon; size?: number }) {
  const props = { size, weight: 'regular' as const, 'aria-hidden': true };
  switch (name) {
    case 'home':
      return <House {...props} />;
    case 'requests':
      return <FileText {...props} />;
    case 'new':
      return <PlusSquare {...props} />;
    case 'trips':
      return <AirplaneTilt {...props} />;
    case 'profile':
      return <UserCircle {...props} />;
    case 'projects':
      return <FileText {...props} />;
    case 'approvals':
      return <Checks {...props} />;
    case 'finance':
      return <Wallet {...props} />;
    case 'admin':
      return <GearSix {...props} />;
    case 'worklog':
      return <CalendarDots {...props} />;
    case 'attention':
      return <WarningCircle {...props} />;
    case 'notifications':
      return <Bell {...props} />;
    case 'receipts':
      return <Receipt {...props} />;
    case 'statement':
      return <ChartBar {...props} />;
    case 'audit':
      return <ClockCounterClockwise {...props} />;
  }
}

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/requests') {
    return (
      pathname === '/requests' ||
      (pathname.startsWith('/requests/') && !pathname.startsWith('/requests/new'))
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);

  return (
    <Link className="nav-link" href={item.href} aria-current={active ? 'page' : undefined}>
      <span className="nav-icon" aria-hidden="true">
        <Icon name={item.icon} />
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

export function PrimaryNavigation({ roles }: { roles: Role[] }) {
  const workNav: NavItem[] = [];
  if (roles.includes('head')) {
    workNav.push({ href: '/approvals', label: 'รออนุมัติ', icon: 'approvals' });
  }
  if (roles.includes('finance')) {
    workNav.push({ href: '/finance', label: 'งานการเงิน', icon: 'finance' });
  }
  if (roles.includes('admin')) {
    workNav.push({ href: '/admin', label: 'จัดการระบบ', icon: 'admin' });
  }

  return (
    <div className="sidebar-nav-stack">
      <nav className="nav-group" aria-label="เมนูพนักงาน">
        <p className="nav-label">MY WORKSPACE</p>
        {employeeNav.map((item) => (
          <NavLink item={item} key={item.href} />
        ))}
      </nav>
      <nav className="nav-group" aria-label="งานรายเดือนและรายการที่ต้องตรวจสอบ">
        <p className="nav-label">MONTHLY OPERATIONS</p>
        {operationsNav.map((item) => (
          <NavLink item={item} key={item.href} />
        ))}
      </nav>
      {workNav.length > 0 ? (
        <nav className="nav-group" aria-label="เมนูงานตามบทบาท">
          <p className="nav-label">WORK QUEUES</p>
          {workNav.map((item) => (
            <NavLink item={item} key={item.href} />
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export function MobileNavigation({ roles }: { roles: Role[] }) {
  const pathname = usePathname();
  const items: NavItem[] = [...employeeNav];
  if (roles.includes('head')) {
    items.push({ href: '/approvals', label: 'อนุมัติ', icon: 'approvals' });
  }
  if (roles.includes('finance')) {
    items.push({ href: '/finance', label: 'การเงิน', icon: 'finance' });
  }
  if (roles.includes('admin')) {
    items.push({ href: '/admin', label: 'Admin', icon: 'admin' });
  }

  return (
    <nav className="mobile-nav" aria-label="เมนูมือถือ">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link href={item.href} key={item.href} aria-current={active ? 'page' : undefined}>
            <span className="mobile-nav-icon" aria-hidden="true">
              <Icon name={item.icon} size={20} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
