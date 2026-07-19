# Playwright Shared Service Specification

The Playwright Shared Service contains the low-level Chromium driver implementation used by the Browser Service.

---

## 1. Description
Implements headless Chromium launches, sets user-agent headers to bypass scraper blockers, manages page navigation timeouts, and cleans up zombie processes.

---

## 2. API Contract
```typescript
import { Browser, Page } from 'playwright';

export interface IPlaywrightService {
  launchHeadless(): Promise<Browser>;
  navigateToPage(page: Page, url: string, timeoutMs: number): Promise<void>;
}
```
