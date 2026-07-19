# ExtractDOM Task Specification

The ExtractDOM Task parses raw HTML text blocks using Cheerio/JSDom to return selected DOM elements deterministically.

---

## 1. Interface & Arguments
* **Input:** `{ rawHtml: string, selectors: Record<string, string> }`
* **Output:** `Record<string, string | string[]>`

---

## 2. Tools & Infrastructure
* Uses Cheerio for fast in-memory string selector extraction. No browser instantiation.

---

## 3. AI Usage Guidelines
* **AI is 100% disabled.** Execution must be purely deterministic.

---

## 4. Error Handling
* Returns empty string values for selectors that fail to match, logging warnings without crashing the execution path.
