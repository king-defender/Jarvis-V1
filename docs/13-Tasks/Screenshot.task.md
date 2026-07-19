# Screenshot Task Specification

The Screenshot Task uses Playwright tabs to save pictures of specified URLs.

---

## 1. Interface & Arguments
* **Input:** `{ url: string, outputPath: string }`
* **Output:** `{ imagePath: string }`

---

## 2. Tools & Infrastructure
* Uses Playwright browser instances.

---

## 3. AI Usage Guidelines
* **AI is 100% disabled.**

---

## 4. Error Handling
* Returns default error screenshot placeholders or logs timeouts.
