import { describe, expect, it } from 'vitest';
import { RuleEngineEvaluator } from './rule-engine.evaluator.js';

describe('RuleEngineEvaluator', () => {
  it('evaluates AND groups with nested fields', () => {
    const matched = RuleEngineEvaluator.evaluateGroup(
      {
        job: { salary: { min: 120000 }, tags: ['Remote', 'TypeScript'] },
      },
      {
        id: 'salary-remote',
        name: 'salary-remote',
        logicalOperator: 'AND',
        conditions: [
          {
            field: 'job.salary.min',
            operator: 'GREATER_THAN_OR_EQUAL',
            value: 100000,
          },
          {
            field: 'job.tags',
            operator: 'CONTAINS_ALL',
            value: ['Remote'],
          },
        ],
      },
    );

    expect(matched).toBe(true);
  });

  it('filters arrays with OR groups', () => {
    const items = [
      { title: 'A', salary: 80_000 },
      { title: 'B', salary: 150_000 },
    ];

    const filtered = RuleEngineEvaluator.filterAll(items, {
      id: 'high-pay',
      name: 'high-pay',
      logicalOperator: 'OR',
      conditions: [
        { field: 'salary', operator: 'GREATER_THAN_OR_EQUAL', value: 140_000 },
        { field: 'title', operator: 'EQUALS', value: 'A' },
      ],
    });

    expect(filtered.map((i) => i.title)).toEqual(['A', 'B']);
  });
});
