import { googleMonthlyHardCap } from './google-api-budget';

export interface ReadinessGate {
  id: string;
  ready: boolean;
  blocking: boolean;
  detail: string;
}

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

function entraAuthReady(env: NodeJS.ProcessEnv): boolean {
  if (!present(env.ENTRA_TENANT_ID) || !present(env.ENTRA_CLIENT_ID)) return false;
  if (env.ENTRA_CLIENT_AUTH_MODE === 'certificate') {
    return present(env.ENTRA_CLIENT_PRIVATE_KEY_PATH) && present(env.ENTRA_CLIENT_CERT_PATH);
  }
  return present(env.ENTRA_CLIENT_AUTH);
}

function graphReadAuthReady(env: NodeJS.ProcessEnv): boolean {
  if (!present(env.OUTLOOK_CALENDAR_TENANT_ID) || !present(env.OUTLOOK_CALENDAR_CLIENT_ID))
    return false;
  if (env.OUTLOOK_CALENDAR_CLIENT_AUTH_MODE === 'certificate') {
    return (
      present(env.OUTLOOK_CALENDAR_CLIENT_PRIVATE_KEY_PATH) &&
      present(env.OUTLOOK_CALENDAR_CLIENT_CERT_PATH)
    );
  }
  return present(env.OUTLOOK_CALENDAR_CLIENT_AUTH);
}

function identityReady(env: NodeJS.ProcessEnv): boolean {
  if (env.AUTH_MODE === 'cloudflare_access') {
    return present(env.CLOUDFLARE_ACCESS_TEAM_DOMAIN) && present(env.CLOUDFLARE_ACCESS_AUD);
  }
  return entraAuthReady(env);
}

export function productionReadiness(env: NodeJS.ProcessEnv = process.env): ReadinessGate[] {
  const origin = env.APP_ORIGIN ?? '';
  const cloudflare = env.AUTH_MODE === 'cloudflare_access';
  return [
    {
      id: 'https_origin',
      ready: origin.startsWith('https://'),
      blocking: true,
      detail: origin.startsWith('https://')
        ? 'APP_ORIGIN uses HTTPS'
        : 'Production hostname/TLS is not configured',
    },
    {
      id: 'identity_gateway',
      ready: identityReady(env),
      blocking: true,
      detail: cloudflare
        ? 'Cloudflare Access team domain and application audience are required; the Access policy must use the approved Microsoft Entra identity provider'
        : 'Dedicated Entra tenant/client/auth and redirect registration are required',
    },
    {
      id: 'document_storage',
      ready:
        env.STORAGE_DRIVER === 'filesystem' &&
        present(env.STORAGE_ROOT) &&
        (env.STORAGE_ROOT ?? '').startsWith('/'),
      blocking: true,
      detail:
        'Production documents require private ESXi-local filesystem storage on an absolute host-backed path',
    },
    {
      id: 'project_master',
      ready:
        present(env.PROJECT_MASTER_TENANT_ID) &&
        present(env.PROJECT_MASTER_SITE_ID) &&
        present(env.PROJECT_MASTER_LIST_ID) &&
        present(env.PROJECT_MASTER_COLUMN_MAP) &&
        graphReadAuthReady(env),
      blocking: true,
      detail:
        'Microsoft Lists/SharePoint Project Master mapping plus the shared read-only Microsoft Graph certificate identity are required; unavailable optional Engineer Lead/Cost Center fields remain blank rather than invented',
    },
    {
      id: 'google_routes_preview',
      ready: present(env.GOOGLE_ROUTES_API_KEY),
      blocking: true,
      detail:
        'A Routes API key enables transient no-store previews only; preview values are not durable provider evidence',
    },
    {
      id: 'google_places_autocomplete',
      ready:
        (present(env.GOOGLE_PLACES_API_KEY) || present(env.GOOGLE_ROUTES_API_KEY)) &&
        env.GOOGLE_PLACES_ENABLED_CONFIRMED === 'true',
      blocking: true,
      detail:
        'Google Places autocomplete requires a configured Places API key; live acceptance must also confirm Places API (New) is enabled',
    },
    {
      id: 'google_api_monthly_budget',
      ready: (() => {
        try {
          return (
            googleMonthlyHardCap('places_autocomplete', env) <= 10_000 &&
            googleMonthlyHardCap('routes_compute', env) <= 10_000 &&
            googleMonthlyHardCap('maps_static', env) <= 10_000
          );
        } catch {
          return false;
        }
      })(),
      blocking: true,
      detail:
        'Application hard caps must stay at or below 10,000 requests/month per Google SKU; production defaults are 8,500 for Places, Routes and Static Maps',
    },
    {
      id: 'google_routes',
      ready: present(env.GOOGLE_ROUTES_API_KEY) && env.GOOGLE_ROUTES_RETENTION_CONFIRMED === 'true',
      blocking: false,
      detail:
        'Durable Google Maps Routes distance/duration evidence is intentionally fail-closed under standard terms; enable only with separately documented licensing/retention rights',
    },
    {
      id: 'easy_acc',
      ready: false,
      blocking: false,
      detail:
        'Direct EASY-ACC integration remains fail-closed until Business Soft provides a sanctioned API/bridge contract; file import and direct database writes are prohibited',
    },
    {
      id: 'smartbiz',
      ready: false,
      blocking: false,
      detail:
        'Installed Smartbiz Desktop has no import menu. Integration remains fail-closed until the Admin-machine Smartbiz Desktop Bridge is mapped and live-UAT verified; file import and direct database writes are prohibited',
    },
    {
      id: 'restore_acceptance',
      ready: env.PRODUCTION_RESTORE_ACCEPTED === 'true',
      blocking: true,
      detail:
        env.PRODUCTION_RESTORE_ACCEPTED === 'true'
          ? 'Receipt-backed production restore drill has been accepted'
          : 'A receipt-backed restore drill must be reviewed and accepted before cutover',
    },
    {
      id: 'cutover_approval',
      ready: env.PRODUCTION_CUTOVER_APPROVED === 'true',
      blocking: true,
      detail:
        env.PRODUCTION_CUTOVER_APPROVED === 'true'
          ? 'Explicit production cutover approval is recorded for this runtime'
          : 'Explicit production cutover approval is required before serving live users',
    },
  ];
}

export function blockingReadiness(gates: ReadinessGate[]): boolean {
  return gates.filter((gate) => gate.blocking).every((gate) => gate.ready);
}
