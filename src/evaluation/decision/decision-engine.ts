import { RuleEngineEvaluator, type RuleGroup } from '../../evaluation/rules/rule-engine.evaluator.js';

export type DecisionActionType =
  | 'DISPATCH_COMMAND'
  | 'TRIGGER_APPROVAL'
  | 'SKIP'
  | 'NOTIFY';

export interface DecisionAction {
  type: DecisionActionType;
  command?: string | undefined;
  payloadTemplate?: Record<string, unknown> | undefined;
  channel?: 'slack' | 'email' | undefined;
  message?: string | undefined;
}

export interface DecisionPolicy {
  id: string;
  name: string;
  ruleGroup: RuleGroup;
  onMatch: DecisionAction;
  onMiss: DecisionAction;
}

export class DecisionEngine {
  decide(
    data: Record<string, unknown>,
    policy: DecisionPolicy,
  ): { matched: boolean; action: DecisionAction } {
    const matched = RuleEngineEvaluator.evaluateGroup(data, policy.ruleGroup);
    return {
      matched,
      action: matched ? policy.onMatch : policy.onMiss,
    };
  }
}
