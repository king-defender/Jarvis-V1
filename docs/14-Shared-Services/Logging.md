# Logging Shared Service Specification

The Logging Shared Service outputs formatted system telemetry.

---

## 1. Description
Implements Winston/Pino logger properties, separates error/warning channels, injects `transactionId` context, and writes local JSON log streams.

---

## 2. API Contract
```typescript
export interface ILoggingService {
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
}
```
