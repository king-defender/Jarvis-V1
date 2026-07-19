# Prompt Library Specification

The Prompt Library contains version-controlled prompt templates for key workflows.

---

## 1. Description
Static templates for parsing resumes, summarizing text, and formatting competitor features, avoiding prompt drift.

---

## 2. API Contract
```typescript
export interface IPromptLibrary {
  getPrompt(templateName: string, variables: Record<string, string>): string;
}
```
