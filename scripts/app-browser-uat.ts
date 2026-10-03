import { chromium, type BrowserContext, type Page } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { closeDb, db } from '../src/server/db';
import { cookieNames, issueSession } from '../src/server/identity';

const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:4311';
const output = 'evidence/app-uat';
const actors = {
  employee: '10000000-0000-4000-8000-000000000001',
  head: '10000000-0000-4000-8000-000000000002',
  finance: '10000000-0000-4000-8000-000000000006',
} as const;

type RoleKey = keyof typeof actors;
type Capture = {
  role: RoleKey | 'public';
  name: string;
  url: string;
  width: number;
  screenshot: string;
  screenshotSha256: string;
  title: string;
  heading: string;
  documentWidth: number;
  loremFound: boolean;
  violations: Array<{ id: string; impact: string | null; nodes: number }>;
};

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'],
});

const report: {
  createdAt: string;
  scope: string;
  browser: string;
  captures: Capture[];
  errors: string[];
  complete: boolean;
} = {
  createdAt: new Date().toISOString(),
  scope: 'Implemented Infinity Employee System UAT on isolated synthetic OCI database',
  browser: await browser.version(),
  captures: [],
  errors: [],
  complete: false,
};

async function restrictedContext(width: number): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : width === 820 ? 1180 : 1000 },
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    reducedMotion: 'reduce',
  });
  await context.route('**/*', (route) => {
    try {
      return new URL(route.request().url()).origin === origin ? route.continue() : route.abort();
    } catch {
      return route.abort();
    }
  });
  return context;
}

async function authenticatedContext(role: RoleKey, width: number): Promise<BrowserContext> {
  const context = await restrictedContext(width);
  const issued = await issueSession(actors[role]);
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
  return context;
}

async function capture(
  page: Page,
  role: RoleKey | 'public',
  name: string,
  path: string,
  width: number,
) {
  const response = await page.goto(new URL(path, origin).toString(), { waitUntil: 'networkidle' });
  if (!response || response.status() >= 400) {
    throw new Error(`${role}/${name} HTTP ${response?.status() ?? 'no-response'}`);
  }
  await page.evaluate(() => document.fonts.ready);
  const info = await page.evaluate(() => ({
    title: document.title,
    heading: document.querySelector('h1')?.textContent?.trim() ?? '',
    documentWidth: document.documentElement.scrollWidth,
    text: document.body.innerText,
  }));
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const screenshot = `${output}/${role}-${name}-${width}.png`;
  await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotSha256 = createHash('sha256')
    .update(await readFile(screenshot))
    .digest('hex');
  report.captures.push({
    role,
    name,
    url: path,
    width,
    screenshot,
    screenshotSha256,
    title: info.title,
    heading: info.heading,
    documentWidth: info.documentWidth,
    loremFound: /lorem ipsum/i.test(info.text),
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      nodes: v.nodes.length,
    })),
  });
}

try {
  const publicContext = await restrictedContext(390);
  const publicPage = await publicContext.newPage();
  await capture(publicPage, 'public', 'sign-in', '/sign-in', 390);
  await publicContext.close();

  const [latestEmployee] = await db()`
    select id from requests
    where employee_id=${actors.employee}
    order by created_at desc
    limit 1
  `;

  const pages: Record<RoleKey, Array<[string, string]>> = {
    employee: [
      ['home', '/'],
      ['requests', '/requests'],
      ['new-leave', '/requests/new?kind=leave'],
      ['new-ot', '/requests/new?kind=ot'],
      ['new-expense', '/requests/new?kind=expense'],
      ['new-trip', '/requests/new?kind=trip'],
      ['new-advance', '/requests/new?kind=advance'],
      ['trips', '/trips'],
      ...(latestEmployee
        ? ([['request-detail', `/requests/${latestEmployee.id}`]] as Array<[string, string]>)
        : []),
    ],
    head: [
      ['home', '/'],
      ['approvals', '/approvals'],
    ],
    finance: [
      ['finance', '/finance'],
      ['payments', '/finance/payments'],
      ['receipts', '/finance/receipts'],
      ['settlements', '/finance/settlements'],
      ['payroll', '/finance/payroll'],
      ['exports', '/finance/exports'],
    ],
  };

  for (const width of [390, 820, 1440] as const) {
    for (const role of Object.keys(pages) as RoleKey[]) {
      const context = await authenticatedContext(role, width);
      const page = await context.newPage();
      page.on('pageerror', (error) => report.errors.push(`${role}/${width}: ${error.message}`));
      for (const [name, path] of pages[role]) {
        await capture(page, role, name, path, width);
      }
      await context.close();
    }
  }

  const blocking = report.captures.filter(
    (row) =>
      row.documentWidth > row.width ||
      row.loremFound ||
      row.violations.some((v) => v.impact === 'serious' || v.impact === 'critical'),
  );
  report.complete = report.errors.length === 0 && blocking.length === 0;
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      event: report.complete ? 'app_browser_uat_pass' : 'app_browser_uat_fail',
      browser: report.browser,
      captures: report.captures.length,
      widths: [390, 820, 1440],
      errors: report.errors,
      blocking: blocking.map((row) => ({
        role: row.role,
        name: row.name,
        width: row.width,
        overflow: row.documentWidth > row.width,
        loremFound: row.loremFound,
        violations: row.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      })),
    }),
  );
  if (!report.complete) process.exitCode = 1;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await closeDb();
}
