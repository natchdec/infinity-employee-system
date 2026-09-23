import { z } from 'zod';

const configSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'uat', 'production']).default('development'),
  APP_ORIGIN: z.string().url().default('http://127.0.0.1:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ENTRA_TENANT_ID: z.string().uuid().optional(),
  ENTRA_CLIENT_ID: z.string().uuid().optional(),
  ENTRA_CLIENT_AUTH: z.string().min(1).optional(),
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
  cached = parsed.data;
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
