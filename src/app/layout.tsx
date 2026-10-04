import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/500.css';
import '@fontsource/noto-sans-thai/600.css';
import '@fontsource/noto-sans-thai/700.css';
import './globals.css';
import './corporate-refresh.css';
import './responsive-fixes.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { PwaRegister } from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: {
    default: 'Infinity Employee',
    template: '%s | Infinity Employee',
  },
  description: 'ระบบคำขอพนักงานและงานการเงินของ Infinity Solution Service',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f66d8',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
