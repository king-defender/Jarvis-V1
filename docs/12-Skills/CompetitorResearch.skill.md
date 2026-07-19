# CompetitorResearch Skill Specification

The CompetitorResearch Skill craws and parses competitor product pages to build feature-matrix comparisons.

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const CompetitorResearchInputSchema = z.object({
  competitorUrls: z.array(z.string().url()).min(1),
  focusCategories: z.array(z.string()).optional()
});
```

---

## 2. Output Schema
```typescript
export interface CompetitorData {
  url: string;
  featuresList: string[];
  pricingRange: string;
  positives: string[];
  negatives: string[];
}

export interface CompetitorResearchOutput {
  matrix: CompetitorData[];
}
```

---

## 3. Task Chain & Tool Map
1. **Scrape Matrix:** Loop page requests using `browser.crawl-page`.
2. **Text Extraction:** Run `ExtractDOMTask` to pull main features sections.
3. **Analyze & Format:** Run `CallLLMTask` (Gemini Flash) to extract structured features.

---

## 4. AI Usage Guidelines
* Processes competitor landing pages to classify feature sets. Model: `Gemini Flash`.

---

## 5. Error Handling
* Returns raw unstructured scraped text blocks alongside a DOM extraction error log rather than crashing the workflow.
