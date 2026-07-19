# Model Router Specification

The Model Router dynamically switches LLM calls between providers based on costs, speed, and availability.

---

## 1. Concept
Provides a unified API to dispatch prompts. If Tier-1 (Claude) fails, hot-swaps to Tier-2 (Gemini Flash), and then to Tier-3 (local Ollama).

---

## 2. Interface API
```typescript
export interface ModelRoutingRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelRoutingResponse {
  text: string;
  modelUsed: string;
  costEstimateUsd: number;
}
```
