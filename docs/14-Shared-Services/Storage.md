# Storage Shared Service Specification

The Storage Shared Service manages structured collections and document operations (MongoDB).

---

## 1. Description
Maintains MongoDB client pools, manages schema/model connection sessions, and runs document queries.

---

## 2. API Contract
```typescript
export interface IStorageService {
  getDb(): any; // Returns MongoDB DB client instance
  collection(name: string): any; // Fetch collection wrapper helper
  startSession(): Promise<any>; // Starts a client session for transactions
}
```
