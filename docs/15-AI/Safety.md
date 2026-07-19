# Safety Specification

The Safety Specification defines data privacy guidelines.

---

## 1. Description
Filters sensitive credentials (keys, tokens) from LLM prompts and scrubs PII from outgoing contexts.

---

## 2. API Contract
```typescript
export interface ISafetyService {
  sanitizePrompt(prompt: string): string;
}
```
