# ParseHTML Task Specification

The ParseHTML Task strips HTML elements, scripts, styles, and headers from crawls, converting raw HTML into readable Markdown summaries.

---

## 1. Interface & Arguments
* **Input:** `{ rawHtml: string }`
* **Output:** `{ markdownContent: string }`

---

## 2. Tools & Infrastructure
* Uses html-to-markdown converters.

---

## 3. AI Usage Guidelines
* **AI is 100% disabled.**

---

## 4. Error Handling
* Safe fallback to basic regex tag stripping on conversion failure.
