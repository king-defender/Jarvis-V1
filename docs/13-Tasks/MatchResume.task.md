# MatchResume Task Specification

The MatchResume Task calculates semantic similarity values (TF-IDF overlap / cosine similarities) between resumes and jobs.

---

## 1. Interface & Arguments
* **Input:** `{ resumeText: string, jobDescription: string }`
* **Output:** `{ score: number, matchedKeywords: string[] }`

---

## 2. Tools & Infrastructure
* Uses natural tokenizers and cosine similarity vector calculators.

---

## 3. AI Usage Guidelines
* **AI is 100% disabled.** Vector similarity is performed mathematically in code.

---

## 4. Error Handling
* Returns `score: 0` if inputs are malformed or empty.
