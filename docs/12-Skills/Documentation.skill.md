# Documentation Skill Specification

The Documentation Skill audits repository files to generate clean markdown API and codebase document structures.

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const DocumentationInputSchema = z.object({
  sourceFilesPaths: z.array(z.string()),
  outputFormat: z.enum(['api_reference', 'architecture_guide', 'getting_started'])
});
```

---

## 2. Output Schema
```typescript
export interface DocumentationOutput {
  generatedDocsMarkdown: string;
  filesProcessed: number;
}
```

---

## 3. Task Chain & Tool Map
1. **Load Code Files:** Run `FileSystemTool` (via Task layer) to load raw code strings.
2. **Draft Documentation:** Invoke `CallLLMTask` (Gemini Flash) to generate markdown reference docs.

---

## 4. AI Usage Guidelines
* Summarizes technical functions and extracts parameter details. Model: `Gemini Flash`.

---

## 5. Error Handling
* Returns standard JSDoc-derived structures if the AI API is unavailable.
