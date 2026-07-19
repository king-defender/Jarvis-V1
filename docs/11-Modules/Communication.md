# Communication Module Specification

The Communication Module manages email summaries, message draft responses, Slack integrations, and instant alerts.

---

## 1. Domain Capabilities & Responsibilities
* Pull and aggregate email threads into bullet-point highlights.
* Generate context-aware replies based on the user's instructions.
* Route transactional notifications (SMS, Email, Slack webhooks) to infrastructure services.
* Monitor incoming chat contexts for actionable follow-ups.

---

## 2. Commands Registered

### `communication.summarize-emails`
* **Input:** `{ folder: 'inbox' | 'archive', maxThreads: number }`
* **Output:** `{ threadsCount: number, summaries: Array<{ threadId: string, subject: string, snippet: string }> }`

### `communication.draft-reply`
* **Input:** `{ emailBody: string, userInstruction: string }`
* **Output:** `{ subjectDraft: string, bodyDraft: string }`

### `communication.send-alert`
* **Input:** `{ channel: 'slack' | 'email', recipient: string, subject: string, message: string }`
* **Output:** `{ status: 'sent' | 'failed', messageId: string }`

---

## 3. Emitted Events
* `communication.emails_summarized`
* `communication.reply_drafted`
* `communication.alert_dispatched`

---

## 4. Skills Utilized
* `CoverLetterSkill`
* `DocumentationSkill`

---

## 5. Database Schema Extensions

```sql
CREATE TABLE IF NOT EXISTS sent_notifications (
    id TEXT PRIMARY KEY,
    recipient TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    sent_at TEXT NOT NULL
);
```

---

## 6. AI Usage Guidelines
* **Thread Summarization:** Condenses large email chains. Model: `Gemini Flash`.
* **Reply Drafting:** Generates natural text replies aligned with user instructions and context. Model: `Tier-1 LLM` (Claude).
* **Alert Delivery:** Direct API webhook payload post to Slack or SMTP client. No AI.
