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
      id: 'object_storage',
      ready:
        env.STORAGE_DRIVER === 's3' && present(env.STORAGE_BUCKET) && present(env.STORAGE_REGION),
      blocking: true,
      detail: 'Production documents require S3-compatible private object storage',
    },
    {
      id: 'project_master',
      ready:
        present(env.PROJECT_MASTER_TENANT_ID) &&
        present(env.PROJECT_MASTER_CLIENT_ID) &&
        present(env.PROJECT_MASTER_CLIENT_AUTH) &&
        present(env.PROJECT_MASTER_SITE_ID) &&
        present(env.PROJECT_MASTER_LIST_ID) &&
        present(env.PROJECT_MASTER_COLUMN_MAP),
      blocking: false,
      detail:
        'Deferred by product decision: Microsoft Lists/SharePoint Project Master can be activated later without blocking core production readiness',
    },
    {
      id: 'google_routes_preview',
      ready: present(env.GOOGLE_ROUTES_API_KEY),
      blocking: true,
      detail:
        'A Routes API key enables transient no-store previews only; preview values are not durable provider evidence',
    },
    {
      id: 'google_routes',
      ready: present(env.GOOGLE_ROUTES_API_KEY) && env.GOOGLE_ROUTES_RETENTION_CONFIRMED === 'true',
      blocking: true,
      detail:
        'Durable Google-verified mileage evidence requires separately confirmed contractual retention rights',
    },
    {
      id: 'easy_acc',
      ready: false,
      blocking: false,
      detail:
        'Deferred by product decision: PRIMPORT.TXT integration remains fail-closed until payroll-owner mappings are verified',
    },
    {
      id: 'smartbiz',
      ready: false,
      blocking: false,
      detail:
        'Deferred by product decision: accounting export remains fail-closed until a sanctioned Smartbiz transaction contract is available',
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
