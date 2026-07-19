# CompanyResearch Skill Specification

The CompanyResearch Skill aggregates data about target corporations, parsing mission statements, product lists, funding status, and leadership details.

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const CompanyResearchInputSchema = z.object({
  companyName: z.string().min(1),
  domainUrl: z.string().url().optional()
});
```

---

## 2. Output Schema
```typescript
export interface CompanyResearchOutput {
  name: string;
  hqLocation?: string;
  sizeRange?: string;
  fundingRound?: string;
  aboutText: string;
  recentNewsHighlights: string[];
}
```

---

## 3. Task Chain & Tool Map
1. **Search Domain:** Query Google Search Tool to locate official company homepage and Crunchbase profiles.
2. **Scrape Details:** Invoke `ExtractDOMTask` (using Playwright) on discovered URLs.
3. **Synthesize Details:** Invoke `CallLLMTask` (Gemini Flash) to build the structured profile report.

---

## 4. AI Usage Guidelines
* Summarizes raw text crawled from Crunchbase or company blogs. Model: `Gemini Flash`.

---

## 5. Error Handling
* Returns structured blank objects with basic domain details if scrapers are blocked.
