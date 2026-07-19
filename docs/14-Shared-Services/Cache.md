# Cache Shared Service Specification

The Cache Shared Service manages fast, volatile in-memory storage (Redis).

---

## 1. Description
Implements string/object caching with customizable Time-To-Live (TTL) tags, manages connection recovery, and clears entries.

---

## 2. API Contract
```typescript
export interface ICacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}
```
