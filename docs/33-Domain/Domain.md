# Domain Models Spec

This document specifies the canonical, storage-agnostic domain entities of the CommandOS platform. Enforcing these definitions ensures that business objects maintain separation from database structures or HTTP payloads.

---

## 1. Domain Entities

### User Entity
```typescript
export interface User {
  id: string;               // Unique user ID
  email: string;
  preferences: {
    timezone: string;
    monthlyTokenBudgetUsd: number;
  };
  createdAt: Date;
}
```

### Job Entity
```typescript
export interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  rawHtml?: string;
  url: string;
  salaryMin?: number;
  salaryMax?: number;
  location: string;
  crawledAt: Date;
}
```

### Resume Entity
```typescript
export interface Resume {
  id: string;
  userId: string;
  versionName: string;
  fileUrl?: string;          // PDF file location path
  parsedText: string;
  experience: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate?: string;
    highlights: string[];
  }>;
  skills: string[];
}
```

### Workflow Execution Entity
```typescript
export interface Workflow {
  id: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTELLIGENCE_DEGRADED' | 'PAUSED';
  currentStepIndex: number;
  variables: Record<string, any>; // Accumulated context values
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 2. Entity Mapping Policy

To maintain clean separation between layers, domain entities are mapped using static mapping adapters:

* **Ingress (API -> Domain):** Controller middleware parses payload parameters and maps them to Domain schemas using Zod validation.
* **Egress (Domain -> Database):** Repository classes map Domain properties to flat columns and JSON string serialized properties inside SQLite.
