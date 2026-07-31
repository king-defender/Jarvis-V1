export interface WorkflowStep {
  id: string;
  name: string;
  command: string;
  payloadMapping: Record<string, string>;
  ruleGroupId?: string;
  retryAttempts: number;
  bypassCache?: boolean;
  /** Steps sharing the same parallelGroup run concurrently. */
  parallelGroup?: string;
}

export interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
}

export type WorkflowStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'INTELLIGENCE_DEGRADED'
  | 'PAUSED';

export interface WorkflowContext {
  workflowId: string;
  transactionId: string;
  definition: WorkflowDefinition;
  accumulatedData: Record<string, unknown>;
  status: WorkflowStatus;
  currentStepIndex: number;
}

export interface ExecutionContext {
  transactionId: string;
  workflowId?: string;
  activeTaskId?: string;
  startedAt: string;
  variables: Record<string, unknown>;
  cancellationToken: {
    isCancelled: boolean;
    reason?: string;
  };
}

export type RunCommandFn = (
  command: string,
  payload: Record<string, unknown>,
  options: {
    transactionId: string;
    userId: string;
    triggerSource: 'CLI' | 'DASHBOARD' | 'CRON' | 'WEBHOOK';
    bypassCache?: boolean;
    workflowId?: string;
    stepName?: string;
  },
) => Promise<unknown>;
