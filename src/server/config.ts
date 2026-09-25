import { z } from 'zod';

const booleanText = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const configSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'uat', 'production']).default('development'),
  APP_ORIGIN: z.string().url().default('http://127.0.0.1:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ENTRA_TENANT_ID: z.string().uuid().optional(),
  ENTRA_CLIENT_ID: z.string().uuid().optional(),
  ENTRA_CLIENT_AUTH_MODE: z.enum(['secret', 'certificate']).default('secret'),
  ENTRA_CLIENT_AUTH: z.string().min(1).optional(),
  ENTRA_CLIENT_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  ENTRA_CLIENT_CERT_PATH: z.string().min(1).optional(),
  STORAGE_DRIVER: z.enum(['filesystem', 's3']).default('filesystem'),
  STORAGE_ROOT: z.string().min(1).default('data/documents'),
  STORAGE_BUCKET: z.string().min(1).optional(),
  STORAGE_REGION: z.string().min(1).optional(),
  STORAGE_ENDPOINT: z.string().url().optional(),
  STORAGE_FORCE_PATH_STYLE: booleanText,
  PROJECT_MASTER_TENANT_ID: z.string().uuid().optional(),
  PROJECT_MASTER_CLIENT_ID: z.string().uuid().optional(),
  PROJECT_MASTER_CLIENT_AUTH: z.string().min(1).optional(),
  PROJECT_MASTER_SITE_ID: z.string().min(1).optional(),
  PROJECT_MASTER_LIST_ID: z.string().min(1).optional(),
  PROJECT_MASTER_COLUMN_MAP: z.string().min(2).optional(),
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
  if (value.APP_ENV === 'production') {
    if (!value.APP_ORIGIN.startsWith('https://')) {
      throw new Error('Production APP_ORIGIN must use HTTPS');
    }
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
    if (value.STORAGE_DRIVER !== 's3') {
      throw new Error('Production document storage must use the s3 driver');
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
