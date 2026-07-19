# JobSearch Skill Specification

The JobSearch Skill aggregates, parses, and filters professional job vacancies based on user search parameters and target locations.

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const JobSearchInputSchema = z.object({
  keywords: z.array(z.string().min(1)),
  location: z.string().min(1),
  minSalary: z.number().optional(),
  bypassCache: z.boolean().default(false)
});
```

---

## 2. Output Schema
```typescript
export interface JobListingItem {
  id: string;
  title: string;
  company: string;
  salaryMin?: number;
  salaryMax?: number;
  description: string;
  url: string;
}

export interface JobSearchOutput {
  jobsFound: number;
  listings: JobListingItem[];
}
```

---

## 3. Task Chain & Tool Map
1. **Fetch Pages:** Runs `browser.crawl-page` (uses Playwright) to retrieve raw HTML.
2. **Extract Items:** Runs `ExtractDOMTask` (uses JSDom or regex matching) to map raw listings.
3. **Parse details:** Runs `ParseHTMLTask` to format descriptions.
4. **Filter:** Runs `RuleEngineEvaluator` to match against salary/keywords.

---

## 4. AI Usage Guidelines
* AI is **never** used to crawl pages.
* AI is used optionally during step 3 (`Gemini Flash`) to extract salary minimums/maximums and location tags from messy job descriptions when deterministic selectors fail.

---

## 5. Error Handling
* **Outage/Blocks:** If LinkedIn blocks requests, catch error and fall back to local database crawl cache; return cached items older than 24 hours and issue a warning flag `INTELLIGENCE_DEGRADED`.
