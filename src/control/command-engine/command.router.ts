import type { Db } from 'mongodb';
import type {
  CommandRegistration,
  SystemCommandDirective,
} from '../../shared/types/command.types.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../infrastructure/services/event-bus.service.js';

export type DirectiveStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export class CommandRouter {
  private readonly registry = new Map<string, CommandRegistration>();

  constructor(
    private readonly eventBus: ISystemEventBus,
    private readonly db: Db,
  ) {}

  register(registration: CommandRegistration): void {
    if (this.registry.has(registration.command)) {
      throw new Error(
        `Command registration conflict: ${registration.command} already exists.`,
      );
    }
    this.registry.set(registration.command, registration);
  }

  listCommands(): string[] {
    return [...this.registry.keys()].sort();
  }

  async route(directive: SystemCommandDirective): Promise<unknown> {
    const startTime = Date.now();
    const registration = this.registry.get(directive.command);

    if (!registration) {
      const routingErr = new Error(
        `Command execution error: ${directive.command} is not a valid endpoint.`,
      );
      this.publishFailure(directive, routingErr, 0);
      throw routingErr;
    }

    const parsedPayload = registration.schema.safeParse(directive.payload);
    if (!parsedPayload.success) {
      const validationErr = new Error(
        `Invalid command payload schema: ${parsedPayload.error.message}`,
      );
      this.publishFailure(directive, validationErr, 0);
      throw validationErr;
    }

    await this.ensureUserProfile(directive.context.userId);
    await this.logDirective(directive, 'PENDING');

    this.eventBus.publish(
      createSystemEvent({
        transactionId: directive.transactionId,
        eventName: 'command.received',
        payload: { command: directive.command },
        producer: 'CommandEngine',
      }),
    );

    try {
      await this.updateDirective(directive.transactionId, 'RUNNING', 0);
      const result = await registration.handler(
        parsedPayload.data as Record<string, unknown>,
        directive.context,
      );
      const duration = Date.now() - startTime;

      await this.updateDirective(directive.transactionId, 'COMPLETED', duration);

      this.eventBus.publish(
        createSystemEvent({
          transactionId: directive.transactionId,
          eventName: 'command.executed',
          payload: { command: directive.command, durationMs: duration },
          producer: 'CommandEngine',
        }),
      );

      return result;
    } catch (err: unknown) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      await this.updateDirective(
        directive.transactionId,
        'FAILED',
        duration,
        message,
      );
      this.publishFailure(
        directive,
        err instanceof Error ? err : new Error(message),
        duration,
      );
      throw err;
    }
  }

  private publishFailure(
    directive: SystemCommandDirective,
    err: Error,
    duration: number,
  ): void {
    this.eventBus.publish(
      createSystemEvent({
        transactionId: directive.transactionId,
        eventName: 'command.failed',
        payload: {
          command: directive.command,
          error: err.message,
          durationMs: duration,
        },
        producer: 'CommandEngine',
      }),
    );
  }

  private async ensureUserProfile(userId: string): Promise<void> {
    await this.db.collection('user_profiles').updateOne(
      { user_id: userId },
      {
        $setOnInsert: {
          user_id: userId,
          profile_data: {},
          created_at: new Date().toISOString(),
        },
        $set: {
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
  }

  private async logDirective(
    directive: SystemCommandDirective,
    status: DirectiveStatus,
  ): Promise<void> {
    type CommandDirectiveDoc = {
      _id: string;
      transaction_id: string;
      command: string;
      timestamp: string;
      payload: Record<string, unknown>;
      user_id: string;
      trigger_source: string;
      bypass_cache: number;
      status: DirectiveStatus;
      error_message: string | null;
      execution_duration_ms: number | null;
      created_at: string;
      updated_at: string;
    };

    await this.db.collection<CommandDirectiveDoc>('command_directives').insertOne({
      _id: directive.transactionId,
      transaction_id: directive.transactionId,
      command: directive.command,
      timestamp: directive.timestamp,
      payload: directive.payload,
      user_id: directive.context.userId,
      trigger_source: directive.context.triggerSource,
      bypass_cache: directive.context.bypassCache ? 1 : 0,
      status,
      error_message: null,
      execution_duration_ms: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  private async updateDirective(
    transactionId: string,
    status: DirectiveStatus,
    durationMs: number,
    errorMessage?: string,
  ): Promise<void> {
    type CommandDirectiveDoc = {
      _id: string;
      status: DirectiveStatus;
      execution_duration_ms: number | null;
      error_message: string | null;
      updated_at: string;
    };

    await this.db.collection<CommandDirectiveDoc>('command_directives').updateOne(
      { _id: transactionId },
      {
        $set: {
          status,
          execution_duration_ms: durationMs,
          error_message: errorMessage ?? null,
          updated_at: new Date().toISOString(),
        },
      },
    );
  }
}
