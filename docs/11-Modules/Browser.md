# Browser Module Specification

The Browser Module manages headless browser session orchestration, DOM crawling, HTML content fetching, and screenshot capturing.

---

## 1. Domain Capabilities & Responsibilities
* Spawn and recycle pooled Playwright browser tabs.
* Wait for, crawl, and cache raw page HTML outputs.
* Capture full-page or element-specific screenshots.
* Fill inputs and trigger clicks to bypass simple client-side interaction gates.

---

## 2. Commands Registered

### `browser.crawl-page`
* **Input:** `{ url: string, waitForSelector?: string, bypassCache?: boolean }`
* **Output:** `{ pageTitle: string, rawHtml: string, httpStatus: number }`

### `browser.screenshot`
* **Input:** `{ url: string, selector?: string }`
* **Output:** `{ imagePath: string, width: number, height: number }`

---

## 3. Emitted Events
* `browser.page_crawled` - Emitted when a URL crawl finishes.
* `browser.screenshot_taken` - Emitted when a screenshot is written to disk.

---

## 4. Skills Utilized
* `CompanyResearchSkill`
* `CompetitorResearchSkill`

---

## 5. Database Schema Extensions

```sql
CREATE TABLE IF NOT EXISTS browser_crawl_cache (
    url_hash TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    raw_html TEXT NOT NULL,
    http_status INTEGER NOT NULL,
    cached_at TEXT NOT NULL
);
```

---

## 6. AI Usage Guidelines
* **HTML Parsing:** AI is **never** used to drive browser actions (clicking, filling, routing). All selectors must be deterministic.
* **Extraction:** The crawler extracts raw HTML; AI extracts details (e.g. jobs, product tables) out-of-process.
