import path from 'node:path';
import { z } from 'zod';

const booleanText = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const optionalUuidText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().uuid().optional(),
);
const optionalNonEmptyText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);
const optionalColumnMapText = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(2).optional(),
);

const configSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'uat', 'production']).default('development'),
  APP_ORIGIN: z.string().url().default('http://127.0.0.1:3000'),
  AUTH_MODE: z.enum(['entra_oidc', 'cloudflare_access']).default('entra_oidc'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ENTRA_TENANT_ID: z.string().uuid().optional(),
  ENTRA_CLIENT_ID: z.string().uuid().optional(),
  ENTRA_CLIENT_AUTH_MODE: z.enum(['secret', 'certificate']).default('secret'),
  ENTRA_CLIENT_AUTH: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  ENTRA_CLIENT_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  ENTRA_CLIENT_CERT_PATH: z.string().min(1).optional(),
  OUTLOOK_CALENDAR_SYNC_ENABLED: booleanText,
  OUTLOOK_CALENDAR_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(15).max(1440).default(60),
  OUTLOOK_CALENDAR_TENANT_ID: z.string().uuid().optional(),
  OUTLOOK_CALENDAR_CLIENT_ID: z.string().uuid().optional(),
  OUTLOOK_CALENDAR_CLIENT_AUTH: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  OUTLOOK_CALENDAR_CLIENT_AUTH_MODE: z.enum(['secret', 'certificate']).default('secret'),
  OUTLOOK_CALENDAR_CLIENT_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  OUTLOOK_CALENDAR_CLIENT_CERT_PATH: z.string().min(1).optional(),
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^[a-z0-9.-]+\.cloudflareaccess\.com$/)
      .optional(),
  ),
  CLOUDFLARE_ACCESS_AUD: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(16).max(512).optional(),
  ),
  TEAMS_NOTIFICATIONS_ENABLED: booleanText,
  TEAMS_NOTIFICATION_WEBHOOK_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  EMAIL_NOTIFICATIONS_ENABLED: booleanText,
  EMAIL_NOTIFICATION_SENDER: z.string().email().default('hr@infinitysolutions.co.th'),
  STORAGE_DRIVER: z.enum(['filesystem', 's3']).default('filesystem'),
  STORAGE_ROOT: z.string().min(1).default('data/documents'),
  STORAGE_BUCKET: z.string().min(1).optional(),
  STORAGE_REGION: z.string().min(1).optional(),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_FORCE_PATH_STYLE: booleanText,
  PROJECT_MASTER_TENANT_ID: optionalUuidText,
  PROJECT_MASTER_CLIENT_ID: optionalUuidText,
  PROJECT_MASTER_CLIENT_AUTH_MODE: z.enum(['secret', 'certificate']).default('secret'),
  PROJECT_MASTER_CLIENT_AUTH: optionalNonEmptyText,
  PROJECT_MASTER_CLIENT_PRIVATE_KEY_PATH: optionalNonEmptyText,
  PROJECT_MASTER_CLIENT_CERT_PATH: optionalNonEmptyText,
  PROJECT_MASTER_SITE_ID: optionalNonEmptyText,
  PROJECT_MASTER_LIST_ID: optionalNonEmptyText,
  PROJECT_MASTER_COLUMN_MAP: optionalColumnMapText,
  GOOGLE_ROUTES_API_KEY: z.string().min(1).optional(),
  GOOGLE_ROUTES_RETENTION_CONFIRMED: booleanText,
});

export type AppConfig = z.infer<typeof configSchema>;

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached) return cached;
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues
      .map((issue) => issue.path.join('.') || 'runtime configuration')
      .join(', ');
    throw new Error(`Invalid application configuration: ${names}`);
  }
  const value = parsed.data;
  if (value.OUTLOOK_CALENDAR_SYNC_ENABLED || value.EMAIL_NOTIFICATIONS_ENABLED) {
    if (!value.OUTLOOK_CALENDAR_TENANT_ID || !value.OUTLOOK_CALENDAR_CLIENT_ID) {
      throw new Error('Outlook Calendar sync requires tenant and application configuration');
    }
    if (
      value.OUTLOOK_CALENDAR_CLIENT_AUTH_MODE === 'secret' &&
      !value.OUTLOOK_CALENDAR_CLIENT_AUTH
    ) {
      throw new Error('Outlook Calendar sync requires a client credential');
    }
    if (
      value.OUTLOOK_CALENDAR_CLIENT_AUTH_MODE === 'certificate' &&
      (!value.OUTLOOK_CALENDAR_CLIENT_PRIVATE_KEY_PATH || !value.OUTLOOK_CALENDAR_CLIENT_CERT_PATH)
    ) {
      throw new Error('Outlook Calendar sync requires certificate paths');
    }
  }
  if (value.APP_ENV === 'production') {
    if (!value.APP_ORIGIN.startsWith('https://')) {
      throw new Error('Production APP_ORIGIN must use HTTPS');
    }
    if (value.AUTH_MODE === 'cloudflare_access') {
      if (!value.CLOUDFLARE_ACCESS_TEAM_DOMAIN || !value.CLOUDFLARE_ACCESS_AUD) {
        throw new Error(
          'Production Cloudflare Access team domain and application audience are required',
        );
      }
    } else {
      if (!value.ENTRA_TENANT_ID || !value.ENTRA_CLIENT_ID) {
        throw new Error('Production Microsoft Entra tenant and application are required');
      }
      if (value.ENTRA_CLIENT_AUTH_MODE === 'secret' && !value.ENTRA_CLIENT_AUTH) {
        throw new Error('Production Microsoft Entra client credential is required');
      }
      if (
        value.ENTRA_CLIENT_AUTH_MODE === 'certificate' &&
        (!value.ENTRA_CLIENT_PRIVATE_KEY_PATH || !value.ENTRA_CLIENT_CERT_PATH)
      ) {
        throw new Error('Production Microsoft Entra certificate paths are required');
      }
    }
    if (value.STORAGE_DRIVER === 'filesystem' && !path.isAbsolute(value.STORAGE_ROOT)) {
      throw new Error('Production filesystem document storage requires an absolute STORAGE_ROOT');
    }
  }
  if (value.STORAGE_DRIVER === 's3' && (!value.STORAGE_BUCKET || !value.STORAGE_REGION)) {
    throw new Error('S3 document storage requires bucket and region configuration');
  }
  cached = value;
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
