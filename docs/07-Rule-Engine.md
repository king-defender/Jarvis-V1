# Rule Engine

## 1. Technical Architecture & Rule Evaluation Flow

The Rule Engine acts as the deterministic gatekeeper of the domain layer. It processes batched raw data arrays (e.g., raw HTML text parsed from job boards or competitors) against structured user profiles without invoking an LLM context window.

```
 [ Input Raw Data Block ] ──> [ Evaluator Runtime ] <── [ User Rule Configurations ]
                                     │
                        ┌────────────┴────────────┐
                        ▼                         ▼
                 { Match = TRUE }          { Match = FALSE }
                        │                         │
                        ▼                         ▼
             [ Forward to Next Task ]       [ Silently Drop / Log ]
```

## 2. Complete TypeScript JSON Rule Schema Spec

All deterministic rules are stored in the database or written as static configurations using this structural grammar:

```typescript
export type RuleOperator = 
  | 'GREATER_THAN_OR_EQUAL' 
  | 'LESS_THAN_OR_EQUAL' 
  | 'EQUALS' 
  | 'NOT_EQUALS'
  | 'CONTAINS_ANY' 
  | 'CONTAINS_ALL' 
  | 'EXCLUDES';

export interface RuleCondition {
  field: string;          // Dot-notation path (e.g., "job.salary.min")
  operator: RuleOperator;
  value: string | number | boolean | string[];
}

export interface RuleGroup {
  id: string;
  name: string;
  logicalOperator: 'AND' | 'OR';
  conditions: RuleCondition[];
}
```

## 3. Concrete Implementation Blueprint

Below is the strict execution logic used by the core evaluation engine:

```typescript
export class RuleEngineEvaluator {
  public static evaluateField(targetValue: any, operator: RuleOperator, ruleValue: any): boolean {
    switch (operator) {
      case 'GREATER_THAN_OR_EQUAL': return targetValue >= ruleValue;
      case 'LESS_THAN_OR_EQUAL':    return targetValue <= ruleValue;
      case 'EQUALS':                return targetValue === ruleValue;
      case 'NOT_EQUALS':            return targetValue !== ruleValue;
      case 'CONTAINS_ANY':
        return Array.isArray(targetValue) && ruleValue.some((v: any) => targetValue.includes(v));
      case 'CONTAINS_ALL':
        return Array.isArray(targetValue) && ruleValue.every((v: any) => targetValue.includes(v));
      case 'EXCLUDES':
        return Array.isArray(targetValue) && !ruleValue.some((v: any) => targetValue.includes(v));
      default:
        return false;
    }
  }

  public static evaluateGroup(data: Record<string, any>, group: RuleGroup): boolean {
    const results = group.conditions.map(condition => {
      // Resolve deeply nested object properties via dot-notation keys
      const targetValue = condition.field.split('.').reduce((obj, key) => obj?.[key], data);
      return this.evaluateField(targetValue, condition.operator, condition.value);
    });

    return group.logicalOperator === 'AND' 
      ? results.every(res => res === true) 
      : results.some(res => res === true);
  }
}
```
