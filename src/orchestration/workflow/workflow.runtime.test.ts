import { describe, expect, it } from 'vitest';
import { WorkflowRuntime } from './workflow.runtime.js';

describe('WorkflowRuntime.planBatches', () => {
  it('groups parallel steps and keeps sequential steps alone', () => {
    const batches = WorkflowRuntime.planBatches([
      {
        id: '1',
        name: 'a',
        command: 'system.ping',
        payloadMapping: {},
        retryAttempts: 0,
        parallelGroup: 'g1',
      },
      {
        id: '2',
        name: 'b',
        command: 'system.ping',
        payloadMapping: {},
        retryAttempts: 0,
        parallelGroup: 'g1',
      },
      {
        id: '3',
        name: 'c',
        command: 'system.ping',
        payloadMapping: {},
        retryAttempts: 0,
      },
    ]);

    expect(batches).toHaveLength(2);
    expect(batches[0]?.map((s) => s.name)).toEqual(['a', 'b']);
    expect(batches[1]?.map((s) => s.name)).toEqual(['c']);
  });
});
