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
    encryptionKey: z.string().min(8).default('dev-encryption-key-change-me'),
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
    engine: z.enum(['auto', 'playwright', 'fetch']).default('auto'),
  }),
  ai: z.object({
    mode: z.enum(['offline', 'ollama', 'hybrid']).default('ollama'),
    defaultModel: z.string().default('claude-3-5-sonnet-20241022'),
    fallbackModel: z.string().default('gemini-1.5-flash'),
    localModel: z.string().default('llama3.2'),
    monthlyLimitUsd: z.coerce.number().default(50),
    providerKey: z.string().optional(),
    anthropicApiKey: z.string().optional(),
    geminiApiKey: z.string().optional(),
    ollamaBaseUrl: z.string().default('http://127.0.0.1:11434'),
    ollamaTimeoutMs: z.coerce.number().int().default(120_000),
  }),
  email: z.object({
    smtpHost: z.string().optional(),
    smtpPort: z.coerce.number().int().default(587),
    smtpSecure: booleanFromEnv.default(false),
    smtpUser: z.string().optional(),
    smtpPass: z.string().optional(),
    fromAddress: z.string().default('commandos@localhost'),
  }),
  github: z.object({
    token: z.string().optional(),
  }),
  search: z.object({
    apiUrl: z.string().optional(),
  }),
  integrations: z.object({
    slackWebhookUrl: z.string().optional(),
  }),
  selfImprove: z.object({
    /** When true, platform.self-edit applies code under allowlist without a second step. */
    autoApplyCodeEdits: booleanFromEnv.default(true),
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
      encryptionKey: env.ENCRYPTION_KEY || env.JWT_SECRET,
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
      engine: env.BROWSER_ENGINE,
    },
    ai: {
      mode: env.AI_MODE,
      defaultModel: env.AI_DEFAULT_MODEL,
      fallbackModel: env.AI_FALLBACK_MODEL,
      localModel: env.AI_LOCAL_MODEL,
      monthlyLimitUsd: env.AI_MONTHLY_LIMIT_USD,
      providerKey: env.AI_PROVIDER_KEY || undefined,
      anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
      geminiApiKey: env.GEMINI_API_KEY || undefined,
      ollamaBaseUrl: env.OLLAMA_BASE_URL || undefined,
      ollamaTimeoutMs: env.OLLAMA_TIMEOUT_MS,
    },
    email: {
      smtpHost: env.SMTP_HOST || undefined,
      smtpPort: env.SMTP_PORT,
      smtpSecure: env.SMTP_SECURE,
      smtpUser: env.SMTP_USER || undefined,
      smtpPass: env.SMTP_PASS || undefined,
      fromAddress: env.SMTP_FROM,
    },
    github: {
      token: env.GITHUB_TOKEN || undefined,
    },
    search: {
      apiUrl: env.SEARCH_API_URL || undefined,
    },
    integrations: {
      slackWebhookUrl: env.SLACK_WEBHOOK_URL || undefined,
    },
    selfImprove: {
      autoApplyCodeEdits: env.SELF_CODE_EDIT,
    },
  });

  if (env === process.env) {
    cachedConfig = parsed;
  }

  return parsed;
}
