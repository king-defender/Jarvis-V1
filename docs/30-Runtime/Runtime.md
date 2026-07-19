# Execution Runtime Spec

The Execution Runtime coordinates the physical execution of CommandOS workflows, tasks, and commands. It manages execution context properties, cancellation tokens, thread pause/resumes, and state checkpoints.

---

## 1. Execution Context Structure

The `ExecutionContext` wraps a running instance of a workflow, holding meta parameters and local variables:

```typescript
export interface ExecutionContext {
  transactionId: string;
  workflowId?: string;
  activeTaskId?: string;
  startedAt: string;
  variables: Record<string, any>; // Transient state storage
  cancellationToken: {
    isCancelled: boolean;
    reason?: string;
  };
}
```

---

## 2. Cancellation Mechanics

Task execution can be cancelled by CLI inputs, dashboard buttons, or system events. 

* **State Check Polling:** Tasks must periodically poll the cancellation token during processing (especially inside loops, web crawls, or API requests):

```typescript
export class CancellableTaskRunner {
  public async execute(context: ExecutionContext, processFn: () => Promise<void>) {
    if (context.cancellationToken.isCancelled) {
      throw new Error(`Task execution aborted: ${context.cancellationToken.reason}`);
    }
    
    await processFn();
  }
}
```

---

## 3. Workflow Pause & Resume (Human-in-the-loop Checkpoints)

Some workflows require manual approvals or external webhook events. The runtime handles pausing and resuming statefully:

1. **Pause:**
   * The step executor encounters an approval gate or wait instruction.
   * The runtime updates the workflow status in SQLite to `PAUSED`.
   * It flushes the accumulated `variables` context to the `workflows` table.
   * The active Redis queue lock is released, and the worker process exits.
2. **Resume:**
   * An API webhook triggers `/api/workflows/:id/resume`.
   * The runtime reads the saved `variables` from SQLite, recreates the `ExecutionContext`, and registers a new task on the Redis queue.
   * Execution continues from the last paused step index.

---

## 4. Checkpoints & Rollback Policies

* **Checkpoints:** At the end of every successful workflow step, the engine writes the step outputs and the full state variables context to the database.
* **Rollbacks:** If a step fails, the system can reload the context variables from the *previous* checkpoint to attempt recovery, avoiding the need to rerun expensive or non-idempotent steps (like scraper queries).
