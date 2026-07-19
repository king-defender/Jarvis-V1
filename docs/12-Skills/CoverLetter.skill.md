# CoverLetter Skill Specification

The CoverLetter Skill drafts high-quality, professional, and tailored cover letters mapping a candidate's background to a target company.

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const CoverLetterInputSchema = z.object({
  candidateProfile: z.record(z.any()),
  jobDescription: z.string(),
  companyName: z.string(),
  tone: z.enum(['professional', 'casual', 'enthusiastic']).default('professional')
});
```

---

## 2. Output Schema
```typescript
export interface CoverLetterOutput {
  draftText: string;
  wordCount: number;
}
```

---

## 3. Task Chain & Tool Map
1. **Match Attributes:** Run `ExtractKeywordsTask` to locate critical hiring values.
2. **Draft Text:** Run `CallLLMTask` (uses ModelRouter) to write letter sections.

---

## 4. AI Usage Guidelines
* Requires creative and stylistic writing. Model: `Tier-1 LLM` (Claude).
* Prompt mandates absolute truthfulness (no hallucinated achievements).

---

## 5. Error Handling
* Returns a deterministic template cover letter (using simple string interpolation of company and title) if the AI service encounters a permanent outage.
