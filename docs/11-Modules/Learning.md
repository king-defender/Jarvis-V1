# Learning Module Specification

The Learning Module manages education roadmaps, flashcard generations, research summarization, and concept quizzing.

---

## 1. Domain Capabilities & Responsibilities
* Parse scientific articles or tutorial documentation into readable summaries.
* Construct customized study paths (syllabi) from core topic descriptions.
* Generate and store flashcards with question-answer pairs.
* Quiz users and tracks memory retention scores.

---

## 2. Commands Registered

### `learning.create-syllabus`
* **Input:** `{ topic: string, totalHours: number, skillLevel: 'beginner' | 'intermediate' | 'advanced' }`
* **Output:** `{ syllabusId: string, modules: Array<{ week: number, title: string, sources: string[] }> }`

### `learning.generate-flashcards`
* **Input:** `{ sourceFilePath: string, maxFlashcards?: number }`
* **Output:** `{ deckId: string, cardsCount: number, cards: Array<{ q: string, a: string }> }`

### `learning.summarize-paper`
* **Input:** `{ paperPath: string }`
* **Output:** `{ abstractSummary: string, keyTakeaways: string[], glossary: Record<string, string> }`

---

## 3. Emitted Events
* `learning.syllabus_created`
* `learning.flashcards_generated`
* `learning.paper_summarized`

---

## 4. Skills Utilized
* `ResearchSkill`
* `DocumentationSkill`

---

## 5. Database Schema Extensions

```sql
CREATE TABLE IF NOT EXISTS learning_decks (
    deck_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cards_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS study_progress (
    card_id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id TEXT NOT NULL,
    box_level INTEGER NOT NULL DEFAULT 1, -- Leitner system spacing levels
    next_review_at TEXT NOT NULL,
    FOREIGN KEY (deck_id) REFERENCES learning_decks(deck_id) ON DELETE CASCADE
);
```

---

## 6. AI Usage Guidelines
* **Paper Summarization:** Pulls key findings and methods from raw text structures. Model: `Gemini Flash` (highly effective at processing large token contexts).
* **Flashcard Q&A Generation:** Translates complex textbook segments into concise Q&A cards. Model: `Gemini Flash`.
* **Leitner Review Spacing Engine:** Purely mathematical date addition. No AI used.
