import { describe, expect, it } from 'vitest';
import { WorkflowCoordinator } from './workflow.coordinator.js';
import type { WorkflowContext } from './workflow.types.js';

describe('WorkflowCoordinator payload mapping', () => {
  it('maps $.context paths into step payloads', async () => {
    const context: WorkflowContext = {
      workflowId: 'wf-1',
      transactionId: '00000000-0000-4000-8000-000000000099',
      definition: { name: 'demo', steps: [] },
      accumulatedData: {
        context: { message: 'hello-world' },
      },
      status: 'RUNNING',
      currentStepIndex: 0,
    };

    const coordinator = new WorkflowCoordinator(context, {
      collection: () => ({
        findOne: async () => null,
        find: () => ({ toArray: async () => [] }),
      }),
    } as never);

    let received: Record<string, unknown> | undefined;
    await coordinator.executeStep(
      {
        id: 's1',
        name: 'ping-one',
        command: 'system.ping',
        payloadMapping: { message: '$.context.message' },
        retryAttempts: 0,
      },
      async (_command, payload) => {
        received = payload;
        return { ok: true };
      },
      'user-1',
    );

    expect(received).toEqual({ message: 'hello-world' });
    expect(context.accumulatedData['ping-one']).toEqual({ ok: true });
  });
});
