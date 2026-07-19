# ParsePDF Task Specification

The ParsePDF Task extracts text data and metadata from PDF files using pdf-parse or pdf-reader.

---

## 1. Interface & Arguments
* **Input:** `{ pdfFilePath: string }`
* **Output:** `{ text: string, metadata: Record<string, any>, pagesCount: number }`

---

## 2. Tools & Infrastructure
* Uses the local node-pdf library.

---

## 3. AI Usage Guidelines
* **AI is 100% disabled.**

---

## 4. Error Handling
* Catch corrupt file errors, returning empty text outputs and registering `PARSE_FAILED` statuses in the task logs.
