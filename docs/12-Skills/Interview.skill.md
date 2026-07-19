# Interview Skill Specification

The Interview Skill parses resumes and job postings to generate custom mock interview questions and structured model answers.

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const InterviewInputSchema = z.object({
  resumeText: z.string(),
  jobDescription: z.string(),
  questionsCount: z.number().int().min(1).max(20).default(5)
});
```

---

## 2. Output Schema
```typescript
export interface MockQuestion {
  question: string;
  category: 'behavioral' | 'technical' | 'situational';
  idealAnswerStarMethod: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
}

export interface InterviewOutput {
  questions: MockQuestion[];
}
```

---

## 3. Task Chain & Tool Map
1. **Analyze Gaps:** Run `MatchResumeTask` to find candidate weaknesses relative to job postings.
2. **Mock Generation:** Run `CallLLMTask` (Gemini Flash) to output custom Q&A arrays matching target competencies.

---

## 4. AI Usage Guidelines
* Generates behavioral questions (STAR structure) based on candidate achievements. Model: `Gemini Flash`.

---

## 5. Error Handling
* Returns a list of 5 general behavioral and technical questions based on standard hiring benchmarks if the AI service fails.
