# Development Module Specification

The Development Module handles code generation, pull request reviews, repository audits, and documentation generation.

---

## 1. Domain Capabilities & Responsibilities
* Autocomplete project code structures and template boilerplates.
* Crawl commit histories and diffs to provide pre-commit PR reviews.
* Run security analysis and scan source code for leaked credentials or dependency vulnerabilities.
* Generate and keep Spec-Driven Development (SDD) markdown documents up to date.

---

## 2. Commands Registered

### `development.generate-boilerplate`
* **Input:** `{ templateType: 'nextjs' | 'vite' | 'sqlite', outputPath: string }`
* **Output:** `{ filesCreated: string[], durationMs: number }`

### `development.review-pr`
* **Input:** `{ repoPath: string, targetBranch: string, sourceBranch: string }`
* **Output:** `{ status: 'approved' | 'changes_requested', reviewSummary: string, inlineComments: Array<{ file: string, line: number, comment: string }> }`

### `development.audit-repo`
* **Input:** `{ repoPath: string }`
* **Output:** `{ issuesCount: number, vulnerabilities: Array<{ severity: string, description: string }> }`

---

## 3. Emitted Events
* `development.boilerplate_generated` - Triggered after boilerplate code blocks are created.
* `development.pr_reviewed` - Triggered when a PR review summary finishes.
* `development.repo_audited` - Emitted when a local source code vulnerability audit completes.

---

## 4. Skills Utilized
* `GithubReviewSkill`
* `PRDGenerationSkill`
* `DocumentationSkill`

---

## 5. Database Schema Extensions

```sql
CREATE TABLE IF NOT EXISTS repositories_audit (
    repo_path TEXT PRIMARY KEY,
    last_audit_at TEXT NOT NULL,
    vulnerabilities_json TEXT NOT NULL,
    health_score INTEGER CHECK (health_score BETWEEN 0 AND 100)
);
```

---

## 6. AI Usage Guidelines
* **PR Code Analysis:** LLM checks source code diffs for security violations, race conditions, or bad practices. Model: `Tier-1 LLM` (fallback to `Gemini Flash`).
* **Boilerplate Generation:** Generates code blocks based on template descriptions. Model: `Gemini Flash`.
* **Vulnerability Audit:** Rule-based scanning matches credential leak patterns (regex) first; LLM validates questionable false positives.
