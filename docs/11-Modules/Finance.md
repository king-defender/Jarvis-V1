# Finance Module Specification

The Finance Module manages expense parsing, budget reporting, asset valuation, and invoice tracking.

---

## 1. Domain Capabilities & Responsibilities
* Extract line items, tax, and merchant details from receipt PDFs/images.
* Match expenses against monthly budgeting rule limits.
* Pull currency rates and asset valuations from external APIs.
* Draft financial invoice templates.

---

## 2. Commands Registered

### `finance.parse-receipt`
* **Input:** `{ receiptFilePath: string }`
* **Output:** `{ merchant: string, date: string, items: Array<{ name: string, price: number }>, total: number, currency: string }`

### `finance.generate-report`
* **Input:** `{ startDate: string, endDate: string }`
* **Output:** `{ reportId: string, totalSpent: number, breakdown: Record<string, number>, withinBudget: boolean }`

---

## 3. Emitted Events
* `finance.receipt_parsed`
* `finance.report_generated`

---

## 4. Skills Utilized
* `PricingAnalysisSkill`
* `ResearchSkill`

---

## 5. Database Schema Extensions

```sql
CREATE TABLE IF NOT EXISTS financial_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant TEXT NOT NULL,
    transaction_date TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    category TEXT NOT NULL,
    raw_payload_json TEXT NOT NULL
);
```

---

## 6. AI Usage Guidelines
* **Receipt OCR Parsing:** Extracts pricing names, total figures, and tax rates from low-resolution images. Model: `Gemini Flash` (using multi-modal image inputs).
* **Expense Category Labeling:** Rules handle exact match matching first (e.g. "Uber" -> Transport); AI handles undefined categories.
* **Budget Calculations:** Pure SQL sum aggregates. No AI allowed.
