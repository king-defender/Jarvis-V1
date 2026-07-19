# Workflow Engine

This document defines the technical design, lifecycle states, and orchestration algorithms used by the CommandOS Workflow Engine.

---

## 1. Workflow Lifecycle State Machine

Workflows coordinate complex sequences of execution commands. They are stateful, persistent, and monitorable.

```
       [ Client Trigger ]
               │
               ▼
         ┌───────────┐
         │  PENDING  │
         └─────┬─────┘
               │ Execute First Step
               ▼
         ┌───────────┐
         │  RUNNING  ├─────────────────────────┐
         └─────┬─────┘                         │
               │                               │
       ┌───────┴───────┐                       │
       ▼               ▼                       ▼
┌───────────┐   ┌─────────────┐         ┌───────────┐
│ COMPLETED │   │ INTELLIGENCE│         │  FAILED   │
│           │   │  DEGRADED   │         │           │
└───────────┘   └─────────────┘         └───────────┘
```

### Lifecycle Status Definitions:
* **PENDING:** Workflow record is created in SQLite; execution payload is validated.
* **RUNNING:** Steps are being dispatched sequentially or in parallel.
* **COMPLETED:** All steps finished successfully with zero fallback degradation.
* **INTELLIGENCE_DEGRADED:** The workflow finished all steps, but one or more downstream steps triggered an AI fallback strategy (e.g. falling back to a cached DOM scraper output or a local Ollama model instead of GPT-4).
* **FAILED:** A step encountered an unrecoverable failure and exhausted its retries.

---

## 2. Workflow & Step Configuration Schema

Workflows are defined statically using TypeScript/JSON schemas:

```typescript
export interface WorkflowStep {
  id: string;
  name: string;               // Descriptive name (e.g. "fetch-job-postings")
  command: string;            // The command directive namespace: "career.fetch-jobs"
  payloadMapping: Record<string, string>; // Maps workflow context to step payload using path strings (e.g. {"keyword": "$.context.searchKeyword"})
  ruleGroupId?: string;       // Optional Rule Engine gatekeeper check before step run
  retryAttempts: number;      // Maximum failures allowed before workflow aborts
  bypassCache?: boolean;
}

export interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
}

export interface WorkflowContext {
  workflowId: string;
  definition: WorkflowDefinition;
  accumulatedData: Record<string, any>;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTELLIGENCE_DEGRADED';
}
```

---

## 3. The Workflow Coordinator Blueprint

The `WorkflowCoordinator` runs steps, evaluates rules, merges payloads, and records progress to the SQLite database.

```typescript
import { RuleEngineEvaluator } from '../evaluation/rules/rule-evaluator'; // From Layer 3

export class WorkflowCoordinator {
  private context: WorkflowContext;

  constructor(context: WorkflowContext) {
    this.context = context;
  }

  // Resolves nested path properties (e.g. "$.context.searchKeyword")
  private resolveValue(path: string, data: Record<string, any>): any {
    if (path.startsWith('$.')) {
      return path.split('.').slice(1).reduce((obj, key) => obj?.[key], data);
    }
    return path; // Static value fallback
  }

  private constructPayload(mapping: Record<string, string>): Record<string, any> {
    const payload: Record<string, any> = {};
    for (const [key, pathValue] of Object.entries(mapping)) {
      payload[key] = this.resolveValue(pathValue, this.context.accumulatedData);
    }
    return payload;
  }

  public async executeStep(step: WorkflowStep, runCommand: (cmd: string, payload: any) => Promise<any>): Promise<boolean> {
    // 1. Evaluate Rule Engine Gatekeeper (Layer 3)
    if (step.ruleGroupId) {
      // In production, the rule group configuration is loaded from SQLite
      const ruleGroup = await this.loadRuleGroup(step.ruleGroupId);
      const isAllowed = RuleEngineEvaluator.evaluateGroup(this.context.accumulatedData, ruleGroup);
      
      if (!isAllowed) {
        console.log(`[Workflow: ${this.context.workflowId}] Step "${step.name}" skipped by Rule Engine.`);
        return true; // Skip step execution gracefully
      }
    }

    // 2. Build input payload from accumulated context mapping
    const stepPayload = this.constructPayload(step.payloadMapping);

    // 3. Execute command directive via Command Engine (Layer 1 invocation)
    let attempts = 0;
    while (attempts <= step.retryAttempts) {
      try {
        const result = await runCommand(step.command, stepPayload);
        
        // Merge result into accumulated context under step namespace
        this.context.accumulatedData[step.name] = result;
        return true;
      } catch (err: any) {
        attempts++;
        console.warn(`[Workflow: ${this.context.workflowId}] Step "${step.name}" failed (Attempt ${attempts}): ${err.message}`);
        
        if (err.status === 'INTELLIGENCE_DEGRADED') {
          this.context.status = 'INTELLIGENCE_DEGRADED';
          // Save degraded step output and continue
          this.context.accumulatedData[step.name] = err.partialOutput || {};
          return true;
        }

        if (attempts > step.retryAttempts) {
          this.context.status = 'FAILED';
          throw new Error(`Workflow execution aborted: Step "${step.name}" failed permanently.`);
        }
      }
    }
    return false;
  }

  private async loadRuleGroup(groupId: string): Promise<any> {
    // Dummy resolver: In production this queries SQLite `rule_groups` & `rule_conditions`
    return { id: groupId, name: 'dummy', logicalOperator: 'AND', conditions: [] };
  }
}
```
