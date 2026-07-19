# Connector Framework Spec

Connectors isolate third-party external integrations (GitHub, LinkedIn, Slack, Gmail, Google Calendar, Notion) from the core logic layers. Every connector implements standardized mechanisms for authentication, rate-limiting, error mapping, and pagination.

---

## 1. Core Connector Interface

All connectors extend the base `IConnector` interface to standardise initialization and health metrics:

```typescript
export interface ConnectorConfig {
  apiKey?: string;
  oauthToken?: string;
  baseUrl: string;
  rateLimitLimit: number; // Max requests per window
  rateLimitWindowMs: number;
}

export interface IConnector {
  id: string;
  initialize(config: ConnectorConfig): Promise<void>;
  testConnection(): Promise<{ healthy: boolean; error?: string }>;
}
```

---

## 2. Shared Integration Strategies

### Authentication
* **OAuth Rotator:** Connectors utilizing OAuth 2.0 (Gmail, Notion) hook into the database to check token expirations and request refresh tokens automatically before invoking operations.
* **Header Injection:** Enforces token injection at request times: `Authorization: Bearer <token>`.

### Rate-Limiting & Jitter Retries
Every outbound call is routed through an in-memory token bucket limiter. If rate limit limits are hit, or downstream APIs return `429 Too Many Requests`:
* **Exponential Backoff:** Pause and retry with delay = `initialDelay * 2^attempt + randomJitter`.
* **Max Attempts:** Aborts call after 3 failed attempts, throwing normalized exceptions up the stack.

### Pagination Standard
To fetch multi-page API datasets (e.g., Notion pages list or GitHub issues catalog), connectors expose stream readers:

```typescript
export interface PaginatedResult<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}
```

### Caching
Data returned from connectors is cached in Redis with short-term (e.g., 5-minute) TTLs by default. High-frequency queries (e.g., fetching a profile photo URL) return cache values instantly.
