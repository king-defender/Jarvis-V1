# ResumeOptimization Skill Specification

The ResumeOptimization Skill analyzes a candidate's resume against a target job description and rewrites descriptions to highlight matching competencies.

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const ResumeOptimizationInputSchema = z.object({
  resumeId: z.string().uuid(),
  jobDescription: z.string().min(10),
  targetFocus: z.array(z.string()).optional()
});
```

---

## 2. Output Schema
```typescript
export interface ResumeOptimizationOutput {
  matchScore: number;            // 0 - 100
  suggestedBulletPoints: Array<{
    section: string;
    original: string;
    suggested: string;
    reason: string;
  }>;
  tailoredResumeData: Record<string, any>; // Updated resume JSON object
}
```

---

## 3. Task Chain & Tool Map
1. **Load Resume:** Query SQLite database for user's primary resume PDF metadata and text.
2. **Score Profile:** Run `MatchResumeTask` to compare semantic overlap.
3. **Draft Adjustments:** Run `CallLLMTask` (uses ModelRouter) to write bullet point options.

---

## 4. AI Usage Guidelines
* AI models (`Claude-3` or `Gemini Flash` as fallback) write experience enhancements.
* Prompts enforce strict styling matching the candidate's original tone; no fabrication of qualifications is permitted.

---

## 5. Error Handling
* If LLM limits are exceeded, return original resume alongside a warning and simple keyword overlap list generated deterministically via the Rule Engine.
