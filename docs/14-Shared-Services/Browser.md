# Browser Shared Service Specification

The Browser Shared Service establishes the abstraction layer for spawning, recycling, and pooling local browser instances.

---

## 1. Description
Provides methods to launch browser instances, manage active tab configurations, configure viewports, and clean up idle browser tabs.

---

## 2. API Contract
```typescript
export interface IBrowserService {
  getBrowserContext(): Promise<any>;
  closeAll(): Promise<void>;
}
```
