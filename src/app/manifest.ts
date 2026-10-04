import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Infinity Employee',
    short_name: 'Infinity Employee',
    description: 'ระบบคำขอพนักงานและงานการเงินของ Infinity Solution Service',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f3ee',
    theme_color: '#e84a0c',
    lang: 'th',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
