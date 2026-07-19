# Career Module Specification

The Career Module manages job applications, profile synchronizations, resume optimizations, and interview preparation.

---

## 1. Domain Capabilities & Responsibilities
* Sync professional profiles (LinkedIn, GitHub) to the local profile database.
* Crawl external job postings and parse details (salary, description, location).
* Score resumes against job descriptions using the deterministic Rule Engine.
* Prepare tailored resumes, cover letters, and interview questions.

---

## 2. Commands Registered

### `career.sync-profile`
* **Input:** `{ platform: 'linkedin' | 'github', bypassCache: boolean }`
* **Output:** `{ status: 'success', lastSyncedAt: string, profileSummary: string }`

### `career.search-jobs`
* **Input:** `{ keywords: string[], location: string, minSalary?: number }`
* **Output:** `{ jobsFound: number, listings: Array<{ id: string, title: string, company: string }> }`

### `career.optimize-resume`
* **Input:** `{ resumeId: string, jobId: string }`
* **Output:** `{ optimizedResumeId: string, diff: string, matchScore: number }`

---

## 3. Emitted Events
* `career.profile_synced` - Emitted when LinkedIn/GitHub crawler finishes syncing profiles.
* `career.jobs_searched` - Emitted after job listing batch crawling completes.
* `career.resume_optimized` - Emitted when an optimized resume version is created.

---

## 4. Skills Utilized
* `LinkedInSyncSkill` (Layer 4)
* `JobSearchSkill` (Layer 4)
* `ResumeOptimizationSkill` (Layer 4)

---

## 5. Database Schema Extensions

```sql
CREATE TABLE IF NOT EXISTS career_profiles (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    raw_data TEXT NOT NULL, -- JSON formatted platform dump
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_listings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    salary_min INTEGER,
    salary_max INTEGER,
    description TEXT NOT NULL,
    url TEXT NOT NULL,
    crawled_at TEXT NOT NULL
);
```

---

## 6. AI Usage Guidelines
* **Parsing Resume:** LLM parses raw text into standardized JSON schemas. Model: `Gemini Flash` (fallback to local `Ollama`).
* **Cover Letter Drafting:** Claude/GPT-4 for writing highly tailored cover letters. Model: `Tier-1 LLM` (fallback to `Gemini Flash`).
* **Routing/Decisions:** None (purely code-driven).
