# Decision Engine Spec

The Decision Engine translates evaluations (emitted from the stateless Rule Engine) into operational actions. It serves as the business policy coordinator mapping Boolean rule outputs to execution directives.

---

## 1. Decision Engine vs. Rule Engine

* **Rule Engine (Layer 3):** Statelessly evaluates fields. Answers: *Does this job pay >= $120,000? (TRUE/FALSE)*.
* **Decision Engine (Layer 2/3 Boundary):** Action-oriented policy coordinator. Answers: *If job pays >= $120,000, should we apply immediately, request manual approval, or send a Slack alert?*

```
[ Input Data Block ] ──> [ Rule Engine ] ──> { Match = TRUE } 
                                                   │
                                                   ▼
                                          [ Decision Engine ]
                                                   │
                         ┌─────────────────────────┼─────────────────────────┐
                         ▼                         ▼                         ▼
               [ APPLY IMMEDIATELY ]      [ REQUEST APPROVAL ]         [ SKIP / LOG ]
```

---

## 2. Decision Logic Schema (TypeScript)

Policies bind evaluated Rule Groups to target operational directives:

```typescript
export type DecisionActionType = 
  | 'DISPATCH_COMMAND' 
  | 'TRIGGER_APPROVAL' 
  | 'SKIP' 
  | 'NOTIFY';

export interface DecisionAction {
  type: DecisionActionType;
  command?: string;                   // E.g., "career.apply"
  payloadTemplate?: Record<string, any>; // maps variables
  channel?: 'slack' | 'email';        // Used for NOTIFY action types
}

export interface DecisionPolicy {
  id: string;
  name: string;
  ruleGroupId: string;                // The Rule Engine evaluator trigger group
  onMatchTrue: DecisionAction;
  onMatchFalse: DecisionAction;
}
```

---

## 3. Core Policy Decider Execution Blueprint

Below is the concrete implementation of the Decision Engine coordinator:

```typescript
import { RuleEngineEvaluator } from '../evaluation/rules/rule-evaluator';

export class DecisionEngineDecider {
  public static async resolve(
    data: Record<string, any>,
    policy: DecisionPolicy,
    loadRuleGroupFn: (id: string) => Promise<any>
  ): Promise<DecisionAction> {
    
    // 1. Fetch target rule conditions
    const ruleGroup = await loadRuleGroupFn(policy.ruleGroupId);
    
    // 2. Statelessly evaluate conditions (Layer 3 call)
    const isMatched = RuleEngineEvaluator.evaluateGroup(data, ruleGroup);
    
    // 3. Resolve target business action based on boolean outcomes
    return isMatched ? policy.onMatchTrue : policy.onMatchFalse;
  }
}
```
