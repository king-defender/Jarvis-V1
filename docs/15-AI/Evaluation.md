# Evaluation Specification

The Evaluation Specification details output validation methods.

---

## 1. Description
Validates LLM string outputs against structured schemas (Zod patterns) before returning responses.

---

## 2. API Contract
```typescript
export interface IEvaluationService {
  validateSchema(text: string, schema: any): boolean;
}
```
