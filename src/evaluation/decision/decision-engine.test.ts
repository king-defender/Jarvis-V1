import { describe, expect, it } from 'vitest';
import { DecisionEngine } from './decision-engine.js';

describe('DecisionEngine', () => {
  it('returns onMatch when rules pass', () => {
    const engine = new DecisionEngine();
    const result = engine.decide(
      { amount: 120 },
      {
        id: 'finance-gate',
        name: 'finance-gate',
        ruleGroup: {
          id: 'g1',
          name: 'g1',
          logicalOperator: 'AND',
          conditions: [
            { field: 'amount', operator: 'GREATER_THAN_OR_EQUAL', value: 100 },
          ],
        },
        onMatch: { type: 'TRIGGER_APPROVAL' },
        onMiss: { type: 'SKIP' },
      },
    );
    expect(result.matched).toBe(true);
    expect(result.action.type).toBe('TRIGGER_APPROVAL');
  });
});
