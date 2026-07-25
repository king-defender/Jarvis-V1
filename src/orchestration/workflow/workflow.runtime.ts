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
} from './workflow.types.js';

export class WorkflowRuntime {
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly cancellations = new Map<string, ExecutionContext['cancellationToken']>();

  constructor(
    private readonly db: Db,
    private readonly eventBus: ISystemEventBus,
    private readonly log: ILoggingService,
    private readonly runCommand: RunCommandFn,
  ) {}

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

    const result = await this.runWorkflow(workflowId, input.userId);
    return { workflowId, status: result.status };
  }

  async get(workflowId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.db.collection('workflows').findOne({ id: workflowId });
    return doc as Record<string, unknown> | null;
  }

  async cancel(workflowId: string, reason = 'cancelled_by_user'): Promise<void> {
    const token = this.cancellations.get(workflowId);
    if (token) {
      token.isCancelled = true;
      token.reason = reason;
    }
    await this.updateWorkflow(workflowId, {
      status: 'FAILED',
      error_message: reason,
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

    try {
      for (; currentStepIndex < definition.steps.length; currentStepIndex += 1) {
        if (token?.isCancelled) {
          throw new Error(`Task execution aborted: ${token.reason ?? 'cancelled'}`);
        }

        const step = definition.steps[currentStepIndex];
        if (!step) {
          break;
        }

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

        const updated = coordinator.getContext();
        await this.updateWorkflow(workflowId, {
          current_step_index: currentStepIndex + 1,
          accumulated_data: updated.accumulatedData,
          status: updated.status === 'INTELLIGENCE_DEGRADED' ? 'INTELLIGENCE_DEGRADED' : 'RUNNING',
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
      await this.updateWorkflow(workflowId, {
        status: 'FAILED',
        error_message: message,
        accumulated_data: coordinator.getContext().accumulatedData,
        current_step_index: currentStepIndex,
      });

      const step = definition.steps[currentStepIndex];
      if (step) {
        await this.db.collection('tasks').updateOne(
          { workflow_id: workflowId, name: step.name },
          {
            $set: {
              status: 'FAILED',
              error_message: message,
              updated_at: new Date().toISOString(),
            },
          },
        );
      }

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
