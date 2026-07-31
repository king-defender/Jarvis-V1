import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../infrastructure/services/event-bus.service.js';
import type { ILoggingService } from '../../infrastructure/services/logging.service.js';
import { WorkflowCoordinator } from './workflow.coordinator.js';
import type {
  ExecutionContext,
  RunCommandFn,
  WorkflowDefinition,
  WorkflowStatus,
  WorkflowStep,
} from './workflow.types.js';

export type EnqueueWorkflowFn = (job: {
  transactionId: string;
  taskId: string;
  workflowId: string;
  command: string;
  payload: Record<string, unknown>;
  retryAttempts: number;
  userId: string;
}) => Promise<string>;

export class WorkflowRuntime {
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly cancellations = new Map<string, ExecutionContext['cancellationToken']>();
  private enqueue: EnqueueWorkflowFn | undefined;

  constructor(
    private readonly db: Db,
    private readonly eventBus: ISystemEventBus,
    private readonly log: ILoggingService,
    private readonly runCommand: RunCommandFn,
  ) {}

  setEnqueue(enqueue: EnqueueWorkflowFn | undefined): void {
    this.enqueue = enqueue;
  }

  register(definition: WorkflowDefinition): void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`Workflow already registered: ${definition.name}`);
    }
    this.definitions.set(definition.name, definition);
  }

  list(): string[] {
    return [...this.definitions.keys()].sort();
  }

  async start(input: {
    name: string;
    userId: string;
    payload?: Record<string, unknown>;
    transactionId?: string;
    async?: boolean;
  }): Promise<{ workflowId: string; status: WorkflowStatus }> {
    const definition = this.definitions.get(input.name);
    if (!definition) {
      throw new Error(`Unknown workflow: ${input.name}`);
    }

    const workflowId = randomUUID();
    const transactionId = input.transactionId ?? randomUUID();
    const now = new Date().toISOString();

    const cancellationToken: {
      isCancelled: boolean;
      reason?: string;
    } = { isCancelled: false };
    this.cancellations.set(workflowId, cancellationToken);

    await this.db.collection('workflows').insertOne({
      _id: workflowId,
      id: workflowId,
      name: definition.name,
      status: 'PENDING',
      input_payload: input.payload ?? {},
      output_payload: null,
      current_step_index: 0,
      transaction_id: transactionId,
      user_id: input.userId,
      accumulated_data: { context: input.payload ?? {} },
      created_at: now,
      updated_at: now,
    } as Record<string, unknown>);

    for (const step of definition.steps) {
      const taskId = randomUUID();
      await this.db.collection('tasks').insertOne({
        _id: taskId,
        id: taskId,
        workflow_id: workflowId,
        name: step.name,
        status: 'PENDING',
        command_directive_id: null,
        error_message: null,
        created_at: now,
        updated_at: now,
      } as Record<string, unknown>);
    }

    this.eventBus.publish(
      createSystemEvent({
        transactionId,
        eventName: 'workflow.started',
        payload: { workflowId, name: definition.name },
        producer: 'WorkflowRuntime',
      }),
    );

    if (input.async && this.enqueue) {
      await this.enqueue({
        transactionId,
        taskId: randomUUID(),
        workflowId,
        command: definition.name,
        payload: { __resumeWorkflowId: workflowId },
        retryAttempts: 1,
        userId: input.userId,
      });
      return { workflowId, status: 'PENDING' };
    }

    const result = await this.runWorkflow(workflowId, input.userId);
    return { workflowId, status: result.status };
  }

  async continueQueued(workflowId: string, userId: string): Promise<{ status: WorkflowStatus }> {
    const doc = await this.db.collection('workflows').findOne({ id: workflowId });
    if (!doc) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    const status = String(doc.status) as WorkflowStatus;
    if (status === 'CANCELLED' || status === 'COMPLETED' || status === 'FAILED') {
      return { status };
    }
    const token = this.cancellations.get(workflowId) ?? { isCancelled: false };
    this.cancellations.set(workflowId, token);
    return this.runWorkflow(workflowId, userId);
  }

  async get(workflowId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.db.collection('workflows').findOne({ id: workflowId });
    return doc as Record<string, unknown> | null;
  }

  async cancel(workflowId: string, reason = 'cancelled_by_user'): Promise<void> {
    const doc = await this.db.collection('workflows').findOne({ id: workflowId });
    if (!doc) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    const status = String(doc.status);
    if (!['PENDING', 'RUNNING', 'PAUSED'].includes(status)) {
      throw new Error(`Workflow cannot be cancelled from status: ${status}`);
    }
    const token = this.cancellations.get(workflowId);
    if (token) {
      token.isCancelled = true;
      token.reason = reason;
    } else {
      this.cancellations.set(workflowId, { isCancelled: true, reason });
    }
    await this.updateWorkflow(workflowId, {
      status: 'CANCELLED',
      error_message: reason,
    });
  }

  async pause(workflowId: string, reason = 'awaiting_approval'): Promise<void> {
    await this.updateWorkflow(workflowId, {
      status: 'PAUSED',
      pause_reason: reason,
    });
  }

  async resume(workflowId: string, userId: string): Promise<{ status: WorkflowStatus }> {
    const doc = await this.db.collection('workflows').findOne({ id: workflowId });
    if (!doc) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    if (doc.status !== 'PAUSED') {
      throw new Error(`Workflow is not paused: ${doc.status}`);
    }

    const token = this.cancellations.get(workflowId) ?? {
      isCancelled: false,
    };
    this.cancellations.set(workflowId, token);
    return this.runWorkflow(workflowId, userId);
  }

  /** Groups sequential steps; adjacent steps with the same parallelGroup run together. */
  static planBatches(steps: WorkflowStep[]): WorkflowStep[][] {
    const batches: WorkflowStep[][] = [];
    let index = 0;
    while (index < steps.length) {
      const current = steps[index];
      if (!current) break;
      if (!current.parallelGroup) {
        batches.push([current]);
        index += 1;
        continue;
      }
      const group = current.parallelGroup;
      const batch: WorkflowStep[] = [];
      while (index < steps.length && steps[index]?.parallelGroup === group) {
        const step = steps[index];
        if (step) batch.push(step);
        index += 1;
      }
      batches.push(batch);
    }
    return batches;
  }

  private async runWorkflow(
    workflowId: string,
    userId: string,
  ): Promise<{ status: WorkflowStatus }> {
    const doc = await this.db.collection('workflows').findOne({ id: workflowId });
    if (!doc) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const definition = this.definitions.get(String(doc.name));
    if (!definition) {
      throw new Error(`Workflow definition missing: ${doc.name}`);
    }

    const transactionId = String(doc.transaction_id);
    let currentStepIndex = Number(doc.current_step_index ?? 0);
    const accumulatedData =
      (doc.accumulated_data as Record<string, unknown>) ??
      ({ context: doc.input_payload ?? {} } as Record<string, unknown>);

    const existingStatus = String(doc.status);
    if (existingStatus === 'CANCELLED' || existingStatus === 'COMPLETED' || existingStatus === 'FAILED') {
      return { status: existingStatus as WorkflowStatus };
    }

    const context = {
      workflowId,
      transactionId,
      definition,
      accumulatedData,
      status: 'RUNNING' as WorkflowStatus,
      currentStepIndex,
    };

    await this.updateWorkflow(workflowId, { status: 'RUNNING' });

    const coordinator = new WorkflowCoordinator(context, this.db);
    const token = this.cancellations.get(workflowId);
    const remaining = definition.steps.slice(currentStepIndex);
    const batches = WorkflowRuntime.planBatches(remaining);

    try {
      for (const batch of batches) {
        if (token?.isCancelled) {
          throw new Error(`Task execution aborted: ${token.reason ?? 'cancelled'}`);
        }

        await Promise.all(
          batch.map(async (step) => {
            await this.db.collection('tasks').updateOne(
              { workflow_id: workflowId, name: step.name },
              {
                $set: {
                  status: 'RUNNING',
                  updated_at: new Date().toISOString(),
                },
              },
            );

            await coordinator.executeStep(step, this.runCommand, userId);

            await this.db.collection('tasks').updateOne(
              { workflow_id: workflowId, name: step.name },
              {
                $set: {
                  status: 'COMPLETED',
                  updated_at: new Date().toISOString(),
                },
              },
            );
          }),
        );

        currentStepIndex += batch.length;
        const updated = coordinator.getContext();
        await this.updateWorkflow(workflowId, {
          current_step_index: currentStepIndex,
          accumulated_data: updated.accumulatedData,
          status:
            updated.status === 'INTELLIGENCE_DEGRADED' ? 'INTELLIGENCE_DEGRADED' : 'RUNNING',
        });
      }

      const finalStatus: WorkflowStatus =
        coordinator.getContext().status === 'INTELLIGENCE_DEGRADED'
          ? 'INTELLIGENCE_DEGRADED'
          : 'COMPLETED';

      await this.updateWorkflow(workflowId, {
        status: finalStatus,
        output_payload: coordinator.getContext().accumulatedData,
        current_step_index: definition.steps.length,
      });

      this.eventBus.publish(
        createSystemEvent({
          transactionId,
          eventName: 'workflow.completed',
          payload: { workflowId, status: finalStatus },
          producer: 'WorkflowRuntime',
        }),
      );

      this.log.info('Workflow completed', { workflowId, status: finalStatus });
      return { status: finalStatus };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (token?.isCancelled) {
        await this.updateWorkflow(workflowId, {
          status: 'CANCELLED',
          error_message: message,
          accumulated_data: coordinator.getContext().accumulatedData,
          current_step_index: currentStepIndex,
        });
        this.log.info('Workflow cancelled', { workflowId, error: message });
        return { status: 'CANCELLED' };
      }

      await this.updateWorkflow(workflowId, {
        status: 'FAILED',
        error_message: message,
        accumulated_data: coordinator.getContext().accumulatedData,
        current_step_index: currentStepIndex,
      });

      this.eventBus.publish(
        createSystemEvent({
          transactionId,
          eventName: 'workflow.step_failed',
          payload: { workflowId, error: message },
          producer: 'WorkflowRuntime',
        }),
      );

      this.log.error('Workflow failed', { workflowId, error: message });
      throw error;
    } finally {
      this.cancellations.delete(workflowId);
    }
  }

  private async updateWorkflow(
    workflowId: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    await this.db.collection('workflows').updateOne(
      { id: workflowId },
      {
        $set: {
          ...fields,
          updated_at: new Date().toISOString(),
        },
      },
    );
  }
}
