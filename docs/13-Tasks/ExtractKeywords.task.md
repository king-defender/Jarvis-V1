# ExtractKeywords Task Specification

The ExtractKeywords Task counts word occurrences in texts, matches lists of target keywords, and calculates term density.

---

## 1. Interface & Arguments
* **Input:** `{ text: string, keywords: string[] }`
* **Output:** `{ matches: Record<string, number>, totalWordsCount: number }`

---

## 2. Tools & Infrastructure
* Pure TypeScript string tokenizer.

---

## 3. AI Usage Guidelines
* **AI is 100% disabled.**

---

## 4. Error Handling
* Safe return of empty maps on string null-pointer errors.
