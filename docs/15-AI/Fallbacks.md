# Fallbacks Specification

The Fallbacks Specification defines model failover rules.

---

## 1. Description
Specifies recovery chains: Claude 3.5 Sonnet -> Gemini 1.5 Flash -> Ollama (Llama 3) -> Regex extractors.

---

## 2. API Contract
```typescript
export interface IFallbackRouter {
  executeWithFallback(prompt: string): Promise<string>;
}
```
