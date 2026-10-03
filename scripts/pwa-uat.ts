import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { closeDb } from '../src/server/db';
import { cookieNames, issueSession } from '../src/server/identity';

const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:4311';
const employeeId = '10000000-0000-4000-8000-000000000001';
const output = 'evidence/app-uat';
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'],
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  });
  await context.route('**/*', (route) => {
    try {
      return new URL(route.request().url()).origin === origin ? route.continue() : route.abort();
    } catch {
      return route.abort();
    }
  });

  const issued = await issueSession(employeeId);
  const names = cookieNames();
  await context.addCookies([
    {
      name: names.session,
      value: issued.sessionValue,
      url: origin,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
      expires: Math.floor(issued.expiresAt.getTime() / 1000),
    },
    {
      name: names.csrf,
      value: issued.antiForgeryValue,
      url: origin,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
      expires: Math.floor(issued.expiresAt.getTime() / 1000),
    },
  ]);

  const page = await context.newPage();
  await page.goto(origin + '/', { waitUntil: 'networkidle' });

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest', { cache: 'no-store' });
    if (!response.ok) throw new Error('manifest HTTP ' + response.status);
    return response.json();
  });
  if (
    manifest.name !== 'Infinity Employee' ||
    manifest.start_url !== '/' ||
    manifest.display !== 'standalone' ||
    !Array.isArray(manifest.icons) ||
    !manifest.icons.some((icon: { sizes?: string }) => icon.sizes === '192x192') ||
    !manifest.icons.some((icon: { sizes?: string }) => icon.sizes === '512x512')
  ) {
    throw new Error('manifest contract mismatch');
  }

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error('service worker inactive');
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3000);
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  });

  const cacheAudit = await page.evaluate(async () => {
    const keys = await caches.keys();
    const paths: string[] = [];
    for (const key of keys) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) {
        paths.push(new URL(request.url).pathname);
      }
    }
    return { keys, paths: paths.sort() };
  });
  const allowed = new Set(['/offline', '/icon-192.png', '/icon-512.png']);
  if (
    cacheAudit.paths.some((path) => !allowed.has(path)) ||
    !cacheAudit.paths.includes('/offline') ||
    cacheAudit.paths.some(
      (path) => path === '/' || path.startsWith('/requests') || path.startsWith('/api'),
    )
  ) {
    throw new Error('service worker cached sensitive or unexpected application data');
  }

  await context.setOffline(true);
  await page.goto(origin + '/requests', { waitUntil: 'domcontentloaded' });
  const offlineHeading = (await page.locator('h1').textContent())?.trim() ?? '';
  const offlineText = await page.locator('body').innerText();
  if (offlineHeading !== 'ขณะนี้ออฟไลน์') throw new Error('offline fallback heading mismatch');
  if (
    offlineText.includes('พนักงานทดสอบ ก') ||
    offlineText.includes('รายการของฉัน') ||
    offlineText.includes('งานการเงิน')
  ) {
    throw new Error('offline fallback exposed cached application data');
  }

  const screenshot = output + '/pwa-offline-390.png';
  await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotSha256 = createHash('sha256')
    .update(await readFile(screenshot))
    .digest('hex');

  await context.setOffline(false);
  await page.goto(origin + '/', { waitUntil: 'networkidle' });
  const recovered = ((await page.locator('h1').textContent()) ?? '').includes('สวัสดี');
  if (!recovered) throw new Error('application did not recover after reconnect');

  const report = {
    event: 'pwa_uat_pass',
    manifest: {
      name: manifest.name,
      display: manifest.display,
      icons: manifest.icons.map((icon: { sizes?: string }) => icon.sizes),
    },
    serviceWorker: true,
    cacheAudit,
    sensitiveDataCached: false,
    offlineFallback: true,
    reconnect: true,
    screenshot,
    screenshotSha256,
  };
  await writeFile(output + '/pwa-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await context.close();
} finally {
  await browser.close();
  await closeDb();
}
