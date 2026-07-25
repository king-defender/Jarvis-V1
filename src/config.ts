import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

export const SystemConfigSchema = z.object({
  app: z.object({
    env: z.enum(['development', 'staging', 'production']).default('development'),
    port: z.coerce.number().int().default(8080),
    baseDataPath: z.string().default('./data'),
  }),
  auth: z.object({
    jwtSecret: z.string().min(8).default('dev-jwt-secret-change-me'),
    apiKeyHash: z.string().optional(),
  }),
  database: z.object({
    mongoUrl: z.string().default('mongodb://127.0.0.1:27017'),
    dbName: z.string().default('command_os'),
    timeoutMs: z.coerce.number().int().default(5000),
  }),
  cache: z.object({
    redisUrl: z.string().default('redis://localhost:6379'),
    defaultTtlSeconds: z.coerce.number().int().default(86400),
  }),
  queue: z.object({
    maxConcurrency: z.coerce.number().int().default(5),
    lockDurationMs: z.coerce.number().int().default(30000),
  }),
  scheduler: z.object({
    scanIntervalMs: z.coerce.number().int().default(60000),
    timezone: z.string().default('UTC'),
  }),
  browser: z.object({
    headless: booleanFromEnv.default(true),
    timeoutMs: z.coerce.number().int().default(15000),
    pageLoadStrategy: z
      .enum(['networkidle', 'load', 'domcontentloaded'])
      .default('networkidle'),
  }),
  ai: z.object({
    defaultModel: z.string().default('claude-3-5-sonnet'),
    fallbackModel: z.string().default('gemini-1-5-flash'),
    localModel: z.string().default('llama3'),
    monthlyLimitUsd: z.coerce.number().default(50),
    providerKey: z.string().optional(),
  }),
});

export type SystemConfig = z.infer<typeof SystemConfigSchema>;

let cachedConfig: SystemConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SystemConfig {
  if (cachedConfig && env === process.env) {
    return cachedConfig;
  }

  const parsed = SystemConfigSchema.parse({
    app: {
      env: env.APP_ENV,
      port: env.PORT,
      baseDataPath: env.BASE_DATA_PATH,
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
      apiKeyHash: env.API_KEY_HASH || undefined,
    },
    database: {
      mongoUrl: env.MONGO_URL,
      dbName: env.MONGO_DB_NAME,
      timeoutMs: env.DATABASE_TIMEOUT_MS,
    },
    cache: {
      redisUrl: env.REDIS_URL,
      defaultTtlSeconds: env.CACHE_TTL_SECONDS,
    },
    queue: {
      maxConcurrency: env.QUEUE_MAX_CONCURRENCY,
    },
    scheduler: {
      scanIntervalMs: env.SCHEDULER_SCAN_INTERVAL_MS,
      timezone: env.SCHEDULER_TIMEZONE,
    },
    browser: {
      headless: env.BROWSER_HEADLESS,
      timeoutMs: env.BROWSER_TIMEOUT_MS,
    },
    ai: {
      defaultModel: env.AI_DEFAULT_MODEL,
      fallbackModel: env.AI_FALLBACK_MODEL,
      localModel: env.AI_LOCAL_MODEL,
      monthlyLimitUsd: env.AI_MONTHLY_LIMIT_USD,
      providerKey: env.AI_PROVIDER_KEY || undefined,
    },
  });

  if (env === process.env) {
    cachedConfig = parsed;
  }

  return parsed;
}
