export class WorkflowPausedError extends Error {
  readonly approvalId: string;
  readonly stepName: string;

  constructor(approvalId: string, stepName: string, message?: string) {
    super(message ?? `Workflow paused awaiting approval ${approvalId}`);
    this.name = 'WorkflowPausedError';
    this.approvalId = approvalId;
    this.stepName = stepName;
  }
}

export function isWorkflowPausedError(error: unknown): error is WorkflowPausedError {
  return (
    error instanceof WorkflowPausedError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'WorkflowPausedError')
  );
}
