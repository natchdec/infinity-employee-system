export interface ReadinessGate {
  id: string;
  ready: boolean;
  detail: string;
}

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

export function productionReadiness(env: NodeJS.ProcessEnv = process.env): ReadinessGate[] {
  const origin = env.APP_ORIGIN ?? '';
  return [
    {
      id: 'https_origin',
      ready: origin.startsWith('https://'),
      detail: origin.startsWith('https://')
        ? 'APP_ORIGIN uses HTTPS'
        : 'Production hostname/TLS is not configured',
    },
    {
      id: 'entra_oidc',
      ready:
        present(env.ENTRA_TENANT_ID) &&
        present(env.ENTRA_CLIENT_ID) &&
        present(env.ENTRA_CLIENT_AUTH),
      detail: 'Dedicated Entra tenant/client/auth and redirect registration are required',
    },
    {
      id: 'object_storage',
      ready:
        env.STORAGE_DRIVER === 's3' && present(env.STORAGE_BUCKET) && present(env.STORAGE_REGION),
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
      detail: 'Microsoft Lists/SharePoint source IDs and explicit column mapping are required',
    },
    {
      id: 'google_routes_preview',
      ready: present(env.GOOGLE_ROUTES_API_KEY),
      detail:
        'A Routes API key enables transient no-store previews only; preview values are not durable provider evidence',
    },
    {
      id: 'google_routes',
      ready: present(env.GOOGLE_ROUTES_API_KEY) && env.GOOGLE_ROUTES_RETENTION_CONFIRMED === 'true',
      detail:
        'Durable Google-verified mileage evidence requires separately confirmed contractual retention rights',
    },
    {
      id: 'easy_acc',
      ready: false,
      detail:
        'PRIMPORT.TXT format is implemented; live employee-code, workday and OT1-4 mappings still require payroll-owner verification',
    },
    {
      id: 'smartbiz',
      ready: false,
      detail:
        'No sanctioned transaction import schema is configured; use a vendor-provided format or Smartbiz 366 Developer Partner API',
    },
    {
      id: 'cutover_approval',
      ready: false,
      detail: 'Explicit production cutover approval is intentionally external to configuration',
    },
  ];
}
