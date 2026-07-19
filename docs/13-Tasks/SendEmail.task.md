# SendEmail Task Specification

The SendEmail Task sends SMTP transactional emails using Nodemailer.

---

## 1. Interface & Arguments
* **Input:** `{ to: string, subject: string, body: string }`
* **Output:** `{ success: boolean, messageId: string }`

---

## 2. Tools & Infrastructure
* Uses the Nodemailer client wrapper.

---

## 3. AI Usage Guidelines
* **AI is 100% disabled.**

---

## 4. Error Handling
* Returns `success: false` and throws SMTP connection errors up to the orchestration retry queue.
