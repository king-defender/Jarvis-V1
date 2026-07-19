# OCR Task Specification

The OCR Task scans images to pull out structured text paragraphs using Tesseract.js or Gemini Vision models.

---

## 1. Interface & Arguments
* **Input:** `{ imageFilePath: string }`
* **Output:** `{ text: string }`

---

## 2. Tools & Infrastructure
* Uses Tesseract.js or fallback to Gemini Vision model calls.

---

## 3. AI Usage Guidelines
* **AI is enabled** for fallback translation of handwritten receipt structures.

---

## 4. Error Handling
* Returns empty string characters if image loading fails.
