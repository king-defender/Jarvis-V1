import type { WorkflowDefinition } from '../../../orchestration/workflow/workflow.types.js';

/** Demo two-step workflow used to validate Sprint 2 orchestration. */
export function getDemoWorkflowDefinition(): WorkflowDefinition {
  return {
    name: 'system.demo',
    steps: [
      {
        id: 'step-1',
        name: 'ping-one',
        command: 'system.ping',
        payloadMapping: {
          message: '$.context.message?',
        },
        retryAttempts: 1,
      },
      {
        id: 'step-2',
        name: 'ping-two',
        command: 'system.ping',
        payloadMapping: {
          message: '$.context.followUp?',
        },
        retryAttempts: 1,
      },
    ],
  };
}
