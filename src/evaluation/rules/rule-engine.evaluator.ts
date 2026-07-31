export type RuleOperator =
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN_OR_EQUAL'
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS_ANY'
  | 'CONTAINS_ALL'
  | 'EXCLUDES';

export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value: string | number | boolean | string[];
}

export interface RuleGroup {
  id: string;
  name: string;
  logicalOperator: 'AND' | 'OR';
  conditions: RuleCondition[];
}

function getByPath(data: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((obj, key) => {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return undefined;
    }
    return (obj as Record<string, unknown>)[key];
  }, data);
}

export class RuleEngineEvaluator {
  public static evaluateField(
    targetValue: unknown,
    operator: RuleOperator,
    ruleValue: unknown,
  ): boolean {
    switch (operator) {
      case 'GREATER_THAN_OR_EQUAL':
        return (
          typeof targetValue === 'number' &&
          typeof ruleValue === 'number' &&
          targetValue >= ruleValue
        );
      case 'LESS_THAN_OR_EQUAL':
        return (
          typeof targetValue === 'number' &&
          typeof ruleValue === 'number' &&
          targetValue <= ruleValue
        );
      case 'EQUALS':
        return targetValue === ruleValue;
      case 'NOT_EQUALS':
        return targetValue !== ruleValue;
      case 'CONTAINS_ANY':
        return (
          Array.isArray(targetValue) &&
          Array.isArray(ruleValue) &&
          ruleValue.some((v) => targetValue.includes(v))
        );
      case 'CONTAINS_ALL':
        return (
          Array.isArray(targetValue) &&
          Array.isArray(ruleValue) &&
          ruleValue.every((v) => targetValue.includes(v))
        );
      case 'EXCLUDES':
        return (
          Array.isArray(targetValue) &&
          Array.isArray(ruleValue) &&
          !ruleValue.some((v) => targetValue.includes(v))
        );
      default:
        return false;
    }
  }

  public static evaluateGroup(
    data: Record<string, unknown>,
    group: RuleGroup,
  ): boolean {
    const results = group.conditions.map((condition) => {
      const targetValue = getByPath(data, condition.field);
      return this.evaluateField(targetValue, condition.operator, condition.value);
    });

    return group.logicalOperator === 'AND'
      ? results.length > 0 && results.every((res) => res === true)
      : results.some((res) => res === true);
  }

  public static filterAll<T extends Record<string, unknown>>(
    items: T[],
    group: RuleGroup,
  ): T[] {
    return items.filter((item) => this.evaluateGroup(item, group));
  }
}
