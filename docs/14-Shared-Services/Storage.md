# Storage Shared Service Specification

The Storage Shared Service manages structured data tables (SQLite).

---

## 1. Description
Maintains SQLite pools, runs migration queries, executes SQL, and enforces foreign key checks.

---

## 2. API Contract
```typescript
export interface IStorageService {
  execute(sql: string, params?: any[]): Promise<any[]>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}
```
