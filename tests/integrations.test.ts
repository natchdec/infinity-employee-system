import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DomainError } from '../src/domain/core';
import { requestSchemas } from '../src/domain/requests';
import { EASY_ACC_INTEGRATION_POLICY } from '../src/server/integrations/easy-acc';
import { blockingReadiness, productionReadiness } from '../src/server/integrations/preflight';
import { validateCloudflareAccessClaims } from '../src/server/cloudflare-access';
import { teamsWorkflowPayload } from '../src/server/integrations/teams-workflow';
import { googleMonthlyHardCap } from '../src/server/integrations/google-api-budget';

test('EASY-ACC direct integration forbids file import and direct database writes', () => {
  assert.equal(EASY_ACC_INTEGRATION_POLICY.transport, 'vendor_api_or_bridge_only');
  assert.equal(EASY_ACC_INTEGRATION_POLICY.fileImportAllowed, false);
  assert.equal(EASY_ACC_INTEGRATION_POLICY.directDatabaseWriteAllowed, false);
});

test('Smartbiz integration targets the installed Admin desktop bridge without import or direct DB writes', () => {
  const gate = productionReadiness({ NODE_ENV: 'test' }).find((item) => item.id === 'smartbiz');
  assert.equal(gate?.blocking, false);
  assert.match(gate?.detail ?? '', /Smartbiz Desktop/);
  assert.match(gate?.detail ?? '', /Desktop Bridge/);
  assert.match(gate?.detail ?? '', /file import/i);
  assert.match(gate?.detail ?? '', /direct database writes/i);
  assert.doesNotMatch(gate?.detail ?? '', /Smartbiz366 Open API/);
});

test('Project margin subtracts both planned and actual employee cost from revenue', () => {
  const source = readFileSync(
    new URL('../src/server/project-profit-reporting.ts', import.meta.url),
    'utf8',
  );
  assert.ok(source.includes('const totalCost = planned + actualTotal;'));
  assert.ok(source.includes('const margin = revenue - totalCost;'));
});

test('Project financial reporting enforces Finance/Admin at the server query boundary', () => {
  const projectReporting = readFileSync(
    new URL('../src/server/project-reporting.ts', import.meta.url),
    'utf8',
  );
  const profitReporting = readFileSync(
    new URL('../src/server/project-profit-reporting.ts', import.meta.url),
    'utf8',
  );
  assert.ok(projectReporting.includes("requireRole(actor, 'finance', 'admin')"));
  assert.ok(profitReporting.includes("requireRole(actor, 'finance', 'admin')"));
});

test('ordinary Project Master detail defaults to a non-financial database projection', () => {
  const source = readFileSync(
    new URL('../src/server/project-master-view.ts', import.meta.url),
    'utf8',
  );
  assert.ok(source.includes("actor.roles.includes('finance') || actor.roles.includes('admin')"));
  assert.ok(source.includes('null::text as cost_center'));
  assert.ok(source.includes("'0'::text as revenue_satang"));
  assert.ok(source.includes("'0'::text as hidden_cost_satang"));
});

test('Google API monthly budget defaults to 8,500 and refuses values above the free-use ceiling', () => {
  assert.equal(googleMonthlyHardCap('places_autocomplete', {}), 8_500);
  assert.equal(googleMonthlyHardCap('routes_compute', {}), 8_500);
  assert.equal(googleMonthlyHardCap('maps_static', {}), 8_500);
  assert.equal(
    googleMonthlyHardCap('places_autocomplete', { GOOGLE_PLACES_MONTHLY_HARD_CAP: '9000' }),
    9_000,
  );
  assert.throws(
    () => googleMonthlyHardCap('routes_compute', { GOOGLE_ROUTES_MONTHLY_HARD_CAP: '10001' }),
    /between 1 and 10000/,
  );
  const unsafe = productionReadiness({
    NODE_ENV: 'test',
    GOOGLE_PLACES_MONTHLY_HARD_CAP: '10001',
  });
  assert.equal(unsafe.find((gate) => gate.id === 'google_api_monthly_budget')?.ready, false);
  assert.equal(unsafe.find((gate) => gate.id === 'google_api_monthly_budget')?.blocking, true);
});

test('Google provider calls reserve the monthly budget before sending a request', () => {
  const places = readFileSync(
    new URL('../src/server/integrations/google-places.ts', import.meta.url),
    'utf8',
  );
  const routes = readFileSync(
    new URL('../src/server/integrations/google-routes.ts', import.meta.url),
    'utf8',
  );
  const migration = readFileSync(
    new URL('../migrations/019_google_api_monthly_budget.sql', import.meta.url),
    'utf8',
  );
  assert.ok(
    places.indexOf("reserveGoogleApiUsage('places_autocomplete')") <
      places.indexOf("fetch('https://places.googleapis.com"),
  );
  assert.ok(
    routes.indexOf("reserveGoogleApiUsage('routes_compute')") <
      routes.indexOf("fetch('https://routes.googleapis.com"),
  );
  assert.ok(migration.includes('PRIMARY KEY (month, sku)'));
});

test('mileage address fields use Google autocomplete and selected place IDs for route preview', () => {
  const expense = readFileSync(
    new URL('../src/components/request/ExpenseFields.tsx', import.meta.url),
    'utf8',
  );
  const autocomplete = readFileSync(
    new URL('../src/components/AddressAutocompleteInput.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(expense.includes('<AddressAutocompleteInput'));
  assert.ok(expense.includes('OriginPlaceId'));
  assert.ok(expense.includes('DestinationPlaceId'));
  assert.ok(expense.includes('originPlaceId ? { placeId: originPlaceId }'));
  assert.ok(autocomplete.includes("fetch('/api/places/autocomplete'"));
  assert.ok(autocomplete.includes('setSelectedPlaceId(item.placeId)'));
});

test('Google route preview returns selectable alternatives with transient geometry', () => {
  const routes = readFileSync(
    new URL('../src/server/integrations/google-routes.ts', import.meta.url),
    'utf8',
  );
  const expense = readFileSync(
    new URL('../src/components/request/ExpenseFields.tsx', import.meta.url),
    'utf8',
  );
  const mapPreview = readFileSync(
    new URL('../src/components/request/RouteMapPreview.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(routes.includes('computeAlternativeRoutes: true'));
  assert.ok(routes.includes('routes.polyline.encodedPolyline'));
  assert.ok(routes.includes('routes,'));
  assert.ok(expense.includes('<RouteMapPreview'));
  assert.ok(expense.includes('selectedRouteIndex'));
  assert.ok(mapPreview.includes('เปิดต้นทางและปลายทางใน Google Maps'));
  assert.ok(mapPreview.includes("fetch('/api/routes/map'"));
  assert.ok(mapPreview.includes('route-map-image'));
});

test('Google route map uses a server-side Static Maps proxy with its own monthly budget', () => {
  const endpoint = readFileSync(
    new URL('../src/app/api/routes/map/route.ts', import.meta.url),
    'utf8',
  );
  const migration = readFileSync(
    new URL('../migrations/021_google_static_maps_budget.sql', import.meta.url),
    'utf8',
  );
  const productionCompose = readFileSync(
    new URL('../docker-compose.production.yml', import.meta.url),
    'utf8',
  );
  assert.ok(endpoint.includes("reserveGoogleApiUsage('maps_static')"));
  assert.ok(endpoint.includes('https://maps.googleapis.com/maps/api/staticmap'));
  assert.ok(endpoint.includes('GOOGLE_ROUTES_API_KEY'));
  assert.ok(endpoint.includes('private, no-store'));
  assert.ok(migration.includes("'maps_static'"));
  assert.equal(productionCompose.split('GOOGLE_MAPS_STATIC_MONTHLY_HARD_CAP').length - 1, 4);
});

test('approval routing always starts from Reporting Line and supports per-type final approvers', () => {
  const routing = readFileSync(
    new URL('../src/server/approval-routing.ts', import.meta.url),
    'utf8',
  );
  const admin = readFileSync(new URL('../src/server/admin-config.ts', import.meta.url), 'utf8');
  const decisions = readFileSync(
    new URL('../src/server/request-decisions.ts', import.meta.url),
    'utf8',
  );
  assert.ok(routing.includes('await activeLineHead(tx, actor.id, today)'));
  assert.ok(routing.includes("'leave_annual'"));
  assert.ok(routing.includes("'leave_sick'"));
  assert.ok(routing.includes("rawMode === 'finance_payer'"));
  assert.ok(admin.includes("mode: z.enum(['none', 'specific_employee', 'finance_payer'])"));
  assert.ok(admin.includes('รายการที่เกี่ยวกับการจ่ายเงินต้องใช้ Finance Payer'));
  assert.ok(decisions.includes('export async function finalApprovalDecision'));
  assert.ok(decisions.includes('FINANCE_FINAL_PAYER_CONFLICT'));
  assert.ok(
    decisions.includes('requireIndependentPayer(actor, current.employee_id, financeVerifierId)'),
  );
});

test('travel toll addon is constrained to mileage, taxi or grab and split by the server', () => {
  const domain = readFileSync(new URL('../src/domain/requests.ts', import.meta.url), 'utf8');
  const prepare = readFileSync(
    new URL('../src/server/prepare-expense.ts', import.meta.url),
    'utf8',
  );
  assert.ok(domain.includes('toll: z'));
  assert.ok(prepare.includes("['mileage', 'taxi', 'grab'].includes(line.categoryId)"));
  assert.ok(prepare.includes("categoryId: 'toll'"));
  assert.ok(prepare.includes("addon: 'toll'"));
});

test('mileage requires commute only for home legs and can use the first baseline retroactively', () => {
  const source = readFileSync(new URL('../src/server/prepare-expense.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("leg.origin === 'home' || leg.destination === 'home'"));
  assert.ok(source.includes('!needsCommute || commute'));
  assert.ok(source.includes('const commuteMetres = commute ? Number(commute.distance_metres) : 0'));
  assert.ok(source.includes('case when effective_from<=${line.date}::date then 0 else 1 end'));
  assert.ok(
    source.includes('case when effective_from>${line.date}::date then effective_from end asc'),
  );
  assert.ok(source.includes('commuteAppliedRetroactively'));
});

test('Google mileage input requires a server-issued quote reference', () => {
  const base = {
    title: 'Mileage',
    projectId: null,
    description: 'Customer visit',
    kind: 'expense' as const,
    parentTripId: null,
    lines: [
      {
        categoryId: 'mileage' as const,
        date: '2026-09-25',
        description: 'Office to customer',
        documentIds: [],
        mileage: [
          {
            origin: 'office' as const,
            destination: 'customer' as const,
            originLabel: 'Office',
            destinationLabel: 'Customer',
            distanceMetres: 10000,
            source: 'google_routes' as const,
          },
        ],
      },
    ],
  };
  assert.equal(requestSchemas.expense.safeParse(base).success, false);
  assert.equal(
    requestSchemas.expense.safeParse({
      ...base,
      lines: [
        {
          ...base.lines[0],
          mileage: [
            {
              ...base.lines[0]!.mileage[0]!,
              providerReference: '00000000-0000-4000-8000-000000000001',
            },
          ],
        },
      ],
    }).success,
    true,
  );
});

test('manual mileage attestation cannot smuggle a provider reference', () => {
  const leg = {
    origin: 'office' as const,
    destination: 'customer' as const,
    originLabel: 'Office',
    destinationLabel: 'Customer',
    distanceMetres: 10000,
    source: 'manual_attested' as const,
    providerReference: '00000000-0000-4000-8000-000000000001',
  };
  const result = requestSchemas.expense.safeParse({
    title: 'Mileage',
    projectId: null,
    description: 'Customer visit',
    kind: 'expense',
    parentTripId: null,
    lines: [
      {
        categoryId: 'mileage',
        date: '2026-09-25',
        description: 'Visit',
        documentIds: [],
        mileage: [leg],
      },
    ],
  });
  assert.equal(result.success, false);
});

test('Project Master source and shared Graph read identity are wired into production app and worker', () => {
  const baseCompose = readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
  const productionCompose = readFileSync(
    new URL('../docker-compose.production.yml', import.meta.url),
    'utf8',
  );
  for (const key of [
    'PROJECT_MASTER_TENANT_ID',
    'PROJECT_MASTER_SITE_ID',
    'PROJECT_MASTER_LIST_ID',
    'PROJECT_MASTER_COLUMN_MAP',
  ]) {
    assert.ok(baseCompose.includes(key + ': ${' + key + ':-}'));
    assert.equal(productionCompose.split(key + ': ${' + key + '}').length - 1, 2);
  }
  for (const key of [
    'OUTLOOK_CALENDAR_TENANT_ID',
    'OUTLOOK_CALENDAR_CLIENT_ID',
    'OUTLOOK_CALENDAR_CLIENT_AUTH_MODE',
    'OUTLOOK_CALENDAR_CLIENT_PRIVATE_KEY_PATH',
    'OUTLOOK_CALENDAR_CLIENT_CERT_PATH',
  ]) {
    assert.ok(baseCompose.includes(key + ': ${' + key));
  }
  assert.equal(
    productionCompose.split('OUTLOOK_CALENDAR_CLIENT_PRIVATE_KEY_HOST_PATH').length - 1,
    2,
  );
  assert.equal(productionCompose.split('OUTLOOK_CALENDAR_CLIENT_CERT_HOST_PATH').length - 1, 2);
});

test('Project Master is production-blocking while Easy-ACC and Smartbiz remain deferred', () => {
  const gates = productionReadiness({ NODE_ENV: 'test' });
  assert.equal(gates.find((gate) => gate.id === 'project_master')?.blocking, true);
  assert.equal(gates.find((gate) => gate.id === 'project_master')?.ready, false);
  assert.equal(gates.find((gate) => gate.id === 'easy_acc')?.blocking, false);
  assert.equal(gates.find((gate) => gate.id === 'smartbiz')?.blocking, false);
});

test('blocking readiness requires Project Master but ignores deferred false gates', () => {
  const gates = productionReadiness({ NODE_ENV: 'test' }).map((gate) =>
    gate.blocking ? { ...gate, ready: true } : gate,
  );
  assert.equal(blockingReadiness(gates), true);
});

test('Google Routes durable evidence stays fail-closed but non-blocking', () => {
  const gates = productionReadiness({ NODE_ENV: 'test' });
  assert.equal(gates.find((gate) => gate.id === 'google_places_autocomplete')?.blocking, true);
  assert.equal(gates.find((gate) => gate.id === 'google_places_autocomplete')?.ready, false);
  assert.equal(gates.find((gate) => gate.id === 'google_routes')?.blocking, false);
  assert.equal(gates.find((gate) => gate.id === 'google_routes')?.ready, false);
  assert.equal(gates.find((gate) => gate.id === 'cutover_approval')?.blocking, true);
  assert.equal(gates.find((gate) => gate.id === 'cutover_approval')?.ready, false);
  assert.equal(blockingReadiness(gates), false);
});

test('production restore acceptance remains a blocking gate', () => {
  const gates = productionReadiness({ NODE_ENV: 'test' });
  assert.equal(gates.find((gate) => gate.id === 'restore_acceptance')?.blocking, true);
  assert.equal(gates.find((gate) => gate.id === 'restore_acceptance')?.ready, false);
});

test('Cloudflare Access claims require issuer, audience and active employee identity claims', () => {
  const identity = validateCloudflareAccessClaims(
    { alg: 'RS256', kid: 'key-1' },
    {
      iss: 'https://steep-scene-b973.cloudflareaccess.com',
      aud: ['0123456789abcdef'],
      email: 'User@InfinitySolutions.co.th',
      sub: 'cloudflare-subject',
      exp: 1100,
      nbf: 900,
      iat: 950,
    },
    {
      teamDomain: 'steep-scene-b973.cloudflareaccess.com',
      audience: '0123456789abcdef',
      nowSeconds: 1000,
    },
  );
  assert.deepEqual(identity, {
    email: 'user@infinitysolutions.co.th',
    subject: 'cloudflare-subject',
  });
});

test('Cloudflare Access claims reject a different application audience', () => {
  assert.throws(
    () =>
      validateCloudflareAccessClaims(
        { alg: 'RS256', kid: 'key-1' },
        {
          iss: 'https://steep-scene-b973.cloudflareaccess.com',
          aud: 'different-audience',
          email: 'user@infinitysolutions.co.th',
          sub: 'cloudflare-subject',
          exp: 1100,
        },
        {
          teamDomain: 'steep-scene-b973.cloudflareaccess.com',
          audience: '0123456789abcdef',
          nowSeconds: 1000,
        },
      ),
    (error: unknown) =>
      error instanceof DomainError && error.code === 'ACCESS_TOKEN_AUDIENCE_REJECTED',
  );
});

test('Cloudflare Access can satisfy the production identity gate without direct Entra app auth', () => {
  const gates = productionReadiness({
    NODE_ENV: 'test',
    AUTH_MODE: 'cloudflare_access',
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: 'steep-scene-b973.cloudflareaccess.com',
    CLOUDFLARE_ACCESS_AUD: '0123456789abcdef',
  });
  assert.equal(gates.find((gate) => gate.id === 'identity_gateway')?.ready, true);
});

test('Teams workflow payload keeps links inside Employee System', () => {
  assert.deepEqual(
    teamsWorkflowPayload(
      {
        title: ' Finance queue ',
        detail: ' Pending work ',
        href: '/finance/operations',
      },
      'https://employee.infinity.example',
    ),
    {
      text: 'Finance queue\nPending work\nhttps://employee.infinity.example/finance/operations',
    },
  );
});

test('Teams workflow payload rejects protocol-relative external links', () => {
  assert.throws(
    () =>
      teamsWorkflowPayload(
        {
          title: 'Unsafe',
          detail: 'Do not send',
          href: '//external.example/phish',
        },
        'https://employee.infinity.example',
      ),
    (error: unknown) =>
      error instanceof DomainError && error.code === 'TEAMS_NOTIFICATION_LINK_INVALID',
  );
});
