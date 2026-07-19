# PRDGeneration Skill Specification

The PRDGeneration Skill compiles raw user ideas and descriptions into formal, production-grade Product Requirements Documents (PRDs).

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const PRDGenerationInputSchema = z.object({
  conceptDescription: z.string().min(20),
  keyUserFlows: z.array(z.string()).optional(),
  targetReleaseVersion: z.string().default('MVP')
});
```

---

## 2. Output Schema
```typescript
export interface PRDGenerationOutput {
  prdMarkdown: string;
  suggestedScopeAdjustments: string[];
}
```

---

## 3. Task Chain & Tool Map
1. **Analyze Input:** Run `ExtractKeywordsTask` to locate technical dependencies.
2. **Draft PRD:** Run `CallLLMTask` (Tier-1 LLM) to construct standard markdown sections.

---

## 4. AI Usage Guidelines
* Writes and formats comprehensive documentation structures. Model: `Tier-1 LLM` (Claude).

---

## 5. Error Handling
* Returns a template outline of standard product sections if the AI service fails.
