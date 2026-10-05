import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Request UX uses semantic icons and status summaries without changing request authorization', () => {
  const list = readFileSync(new URL('../src/app/requests/page.tsx', import.meta.url), 'utf8');
  const create = readFileSync(new URL('../src/app/requests/new/page.tsx', import.meta.url), 'utf8');
  const form = readFileSync(
    new URL('../src/components/request/RequestForm.tsx', import.meta.url),
    'utf8',
  );

  assert.ok(list.includes('request-summary-grid'));
  assert.ok(list.includes('request-kind-badge'));
  assert.ok(list.includes('ArrowCounterClockwise'));
  assert.ok(list.includes('employeeRequests(actor.id, 100)'));
  assert.ok(create.includes('request-kind-choice'));
  assert.ok(create.includes('ค่าใช้จ่าย / ค่ารถ'));
  assert.ok(create.includes('เดินทางไปปฏิบัติงาน'));
  assert.ok(create.includes('เปิดปฏิทินงาน'));
  assert.ok(form.includes('data-kind={kind}'));
  assert.ok(form.includes('request-form-kind-banner'));
  assert.ok(form.includes('ตรวจสอบและส่ง'));
});

test('Google route preview is compact by default and supports client-side zoom and frame expansion', () => {
  const map = readFileSync(
    new URL('../src/components/request/RouteMapPreview.tsx', import.meta.url),
    'utf8',
  );
  const css = readFileSync(new URL('../src/app/brand-v5.css', import.meta.url), 'utf8');

  assert.ok(map.includes('MAP_SCALE_MIN = 0.7'));
  assert.ok(map.includes('MAP_SCALE_MAX = 2'));
  assert.ok(map.includes('aria-label="ย่อแผนที่"'));
  assert.ok(map.includes('aria-label="ขยายแผนที่"'));
  assert.ok(map.includes("mapExpanded ? 'ย่อกรอบ' : 'ขยายกรอบ'"));
  assert.ok(map.includes("fetch('/api/routes/map'"));
  assert.ok(css.includes('.route-map-canvas'));
  assert.ok(css.includes('height: 250px'));
  assert.ok(css.includes('.route-map-frame-google.is-expanded .route-map-canvas'));
});
