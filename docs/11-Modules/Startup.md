# Startup Module Specification

The Startup Module handles competitor research, SEO auditing, business strategy drafting, and pricing analysis.

---

## 1. Domain Capabilities & Responsibilities
* Scrape competitor landing pages and pricing plans.
* Monitor search engine rankings and keyword optimization opportunities.
* Generate pitch decks, business proposals, and product requirements documents (PRDs).
* Match pricing models against target customer willingness to pay datasets.

---

## 2. Commands Registered

### `startup.analyze-competitor`
* **Input:** `{ domainUrl: string }`
* **Output:** `{ companyName: string, pricingPlans: Array<{ name: string, price: string }>, keyFeatures: string[] }`

### `startup.generate-pitch`
* **Input:** `{ productConcept: string, targetAudience: string }`
* **Output:** `{ slideDeckOutline: string[], valueProposition: string }`

### `startup.optimize-seo`
* **Input:** `{ siteUrl: string, targetKeywords: string[] }`
* **Output:** `{ metaSuggestions: Record<string, string>, readabilityScore: number }`

---

## 3. Emitted Events
* `startup.competitor_analyzed`
* `startup.pitch_generated`
* `startup.seo_optimized`

---

## 4. Skills Utilized
* `CompetitorResearchSkill`
* `PricingAnalysisSkill`
* `SEOSkill`

---

## 5. Database Schema Extensions

```sql
CREATE TABLE IF NOT EXISTS competitor_profiles (
    domain_url TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    raw_pricing_data TEXT NOT NULL, -- JSON formatted list of pricing features
    scraped_at TEXT NOT NULL
);
```

---

## 6. AI Usage Guidelines
* **Competitor Pricing Parsing:** Extracts complex pricing tables from raw scraped HTML text blocks. Model: `Gemini Flash`.
* **Value Prop Writing:** Tailors business summaries for investors. Model: `Tier-1 LLM` (Claude).
* **SEO Keyword Evaluation:** Non-AI keyword density check first; AI for semantic synonym expansions and meta tags.
