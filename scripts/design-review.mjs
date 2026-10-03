import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const width = Number(process.argv[2]);
if (![390, 820, 1440].includes(width))
  throw new Error('Provide exactly one supported viewport width');
const screens = [
  'home',
  'leave',
  'ot',
  'expense',
  'mileage',
  'trip',
  'settlement',
  'approval',
  'finance',
  'payment',
  'policy',
  'signin',
  'empty',
  'error',
  'offline',
];
const output = 'evidence/design';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'],
});
const context = await browser.newContext({
  viewport: { width, height: width === 390 ? 844 : 1000 },
  locale: 'th-TH',
  timezoneId: 'Asia/Bangkok',
  reducedMotion: 'reduce',
});
// Only our trusted loopback prototype is allowed. Container isolation is unchanged.
await context.route('**/*', (route) =>
  new URL(route.request().url()).origin === 'http://127.0.0.1:4310'
    ? route.continue()
    : route.abort(),
);
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const sources = [
  'design/index.html',
  'design/preview.css',
  'design/preview.js',
  'design/helpers.js',
  'design/employee-views.js',
  'design/travel-views.js',
  'design/operations-views.js',
  'scripts/design-server.mjs',
  'scripts/design-review.mjs',
];
const fingerprints = Object.fromEntries(
  await Promise.all(
    sources.map(async (file) => [
      file,
      createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
    ]),
  ),
);
const report = {
  createdAt: new Date().toISOString(),
  width,
  scope: 'Synthetic design prototype; not implemented-app UAT',
  browser: { version: await browser.version(), sandbox: false, network: 'trusted loopback only' },
  fingerprints,
  results: [],
  errors,
  complete: false,
  visualInspection: 'PENDING_IMAGE_REVIEW',
};
const save = () => writeFile(`${output}/report-${width}.json`, JSON.stringify(report, null, 2));
try {
  for (const screen of screens) {
    await page.goto(`http://127.0.0.1:4310/?screen=${screen}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      heading: document.querySelector('h1')?.textContent,
      fontLoaded: document.fonts.check('16px EmployeeThai'),
    }));
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const screenshot = `${output}/${screen}-${width}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    report.results.push({
      screen,
      width,
      ...geometry,
      screenshot,
      screenshotSha256: createHash('sha256')
        .update(await readFile(screenshot))
        .digest('hex'),
      violations: axe.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
    });
    await save();
  }
  await page.goto('http://127.0.0.1:4310/?screen=expense');
  await page.getByRole('button', { name: 'ตรวจสอบคำขอ' }).click();
  report.dialogOpened = await page.getByRole('dialog').isVisible();
  await page.keyboard.press('Escape');
  report.dialogClosed = !(await page.getByRole('dialog').isVisible());
  report.complete = true;
  await save();
  const blocking = report.results.filter(
    (row) =>
      row.documentWidth > width ||
      row.violations.some((v) => ['serious', 'critical'].includes(v.impact)),
  );
  console.log(
    JSON.stringify({
      width,
      captures: report.results.length,
      complete: report.complete,
      errors,
      blocking: blocking.map((row) => ({
        screen: row.screen,
        overflow: row.documentWidth > width,
        violations: row.violations,
      })),
    }),
  );
  if (blocking.length || errors.length || !report.dialogOpened || !report.dialogClosed)
    process.exitCode = 1;
} finally {
  await save();
  await context.close();
  await browser.close();
}
