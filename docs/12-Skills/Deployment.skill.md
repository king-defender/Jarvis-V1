# Deployment Skill Specification

The Deployment Skill generates deployment manifests, CI/CD pipelines, and Docker configuration files for applications.

---

## 1. Input Schema (Zod)
```typescript
import { z } from 'zod';
export const DeploymentInputSchema = z.object({
  projectType: z.enum(['node', 'python', 'docker_compose']),
  targetEnvironment: z.enum(['development', 'staging', 'production']),
  ports: z.array(z.number()).default([8080])
});
```

---

## 2. Output Schema
```typescript
export interface DeploymentOutput {
  dockerfileContent: string;
  ciPipelineContent: string;
  deploymentNotes: string;
}
```

---

## 3. Task Chain & Tool Map
1. **Analyze Configs:** Load package configs from codebase.
2. **Draft Manifests:** Run `CallLLMTask` (Gemini Flash) to generate YAML/Dockerfile structures.

---

## 4. AI Usage Guidelines
* Generates standardized deployment configuration files. Model: `Gemini Flash`.

---

## 5. Error Handling
* Returns static pre-defined Dockerfile templates for Node/Python if AI APIs fail.
