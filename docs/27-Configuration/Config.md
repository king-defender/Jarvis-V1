# Configuration System Spec

CommandOS utilizes a unified, schema-validated configuration system driven by Zod. Configurations are populated from environment variables, local JSON files, or database settings.

---

## 1. Unified Configuration Schema (TypeScript)

```typescript
import { z } from 'zod';

export const SystemConfigSchema = z.object({
  app: z.object({
    env: z.enum(['development', 'staging', 'production']).default('development'),
    port: z.number().int().default(8080),
    baseDataPath: z.string().default('./data')
  }),
  database: z.object({
    sqlitePath: z.string().default('./database/dev.sqlite3'),
    timeoutMs: z.number().int().default(5000),
    maxConnections: z.number().int().default(1) // Keep at 1 for SQLite concurrency safety
  }),
  cache: z.object({
    redisUrl: z.string().url().default('redis://localhost:6379'),
    defaultTtlSeconds: z.number().int().default(86400) // 24 hours
  }),
  queue: z.object({
    maxConcurrency: z.number().int().default(5),
    lockDurationMs: z.number().int().default(30000)
  }),
  scheduler: z.object({
    scanIntervalMs: z.number().int().default(60000), // 1 minute
    timezone: z.string().default('UTC')
  }),
  browser: z.object({
    headless: z.boolean().default(true),
    timeoutMs: z.number().int().default(15000),
    pageLoadStrategy: z.enum(['networkidle', 'load', 'domcontentloaded']).default('networkidle')
  }),
  ai: z.object({
    defaultModel: z.string().default('claude-3-5-sonnet'),
    fallbackModel: z.string().default('gemini-1-5-flash'),
    localModel: z.string().default('llama3'),
    monthlyLimitUsd: z.number().default(50.00)
  })
});

export type SystemConfig = z.infer<typeof SystemConfigSchema>;
```

---

## 2. Dynamic Feature Flags

Feature flags are loaded from the `system_flags` configuration or SQLite table to toggle modules at runtime without rebuilding the app:

| Flag Name | Type | Purpose | Default |
| --- | --- | --- | --- |
| `enable_ai_enrichment` | `boolean` | Allows LLM utility calls during crawls. If false, falls back strictly to regex. | `true` |
| `enable_parallel_workers` | `boolean` | Activates concurrent Redis queue workers. | `false` |
| `enable_ollama_local` | `boolean` | Permits local Llama3 fallbacks if internet connections fail. | `true` |
| `enforce_approval_gates` | `boolean` | Intercepts high-privilege commands and places them in pending review. | `true` |

---

## 3. Configuration Access Example

```typescript
import { loadConfig } from './config-loader';

const config = loadConfig();

// Accessing properties
console.log(`Routing using model: ${config.ai.defaultModel}`);
console.log(`Setting cache expiration to: ${config.cache.defaultTtlSeconds}s`);
```
