# GithubReview Skill Specification

The GithubReview Skill connects to GitHub API endpoints or local repositories to audit branch diffs and flag architectural anti-patterns.

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const GithubReviewInputSchema = z.object({
  repositoryPath: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string()
});
```

---

## 2. Output Schema
```typescript
export interface ReviewComment {
  filePath: string;
  lineNumber: number;
  message: string;
  severity: 'suggestion' | 'warning' | 'blocking';
}

export interface GithubReviewOutput {
  status: 'approved' | 'changes_requested';
  comments: ReviewComment[];
}
```

---

## 3. Task Chain & Tool Map
1. **Fetch Diff:** Run `GitCloneTask` (or local git commands) to pull diff branches.
2. **Scan Code:** Execute basic syntax parser task.
3. **Audit Diffs:** Invoke `CallLLMTask` (Tier-1 LLM) to check changes.

---

## 4. AI Usage Guidelines
* Analyzes raw code structures for logic bugs and security flaws. Model: `Tier-1 LLM` (Claude).

---

## 5. Error Handling
* Returns a simple linter-based error output if AI engines are offline.
