# PricingAnalysis Skill Specification

The PricingAnalysis Skill evaluates competitor pricing tables to recommend optimal local pricing strategies for products.

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const PricingAnalysisInputSchema = z.object({
  competitorPricingData: z.array(z.record(z.any())),
  targetCostMarginPercent: z.number().default(50)
});
```

---

## 2. Output Schema
```typescript
export interface PricingTierRecommendation {
  tierName: string;
  suggestedPrice: number;
  billingFrequency: 'monthly' | 'annually';
  includedFeatures: string[];
}

export interface PricingAnalysisOutput {
  recommendations: PricingTierRecommendation[];
  analysisSummary: string;
}
```

---

## 3. Task Chain & Tool Map
1. **Analyze Competitor Data:** Pass prices to `RuleEngineEvaluator` to locate minimum/maximum price barriers.
2. **Strategy Draft:** Run `CallLLMTask` to map recommended tiers.

---

## 4. AI Usage Guidelines
* Identifies value gaps and generates pricing tier suggestions. Model: `Gemini Flash`.

---

## 5. Error Handling
* Returns average price points computed mathematically via SQL if LLM requests fail.
