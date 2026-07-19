# Command Engine

This document specifies the internal execution mechanics, registry, validation pipeline, and tracking contracts for the CommandOS Command Engine.

---

## 1. Gateway Request Pipeline

The Command Engine processes all ingress triggers through a strict validation and logging pipeline before routing requests to the target domain module.

```
 [ Ingress Command Request ] (HTTP, CLI, Cron)
              │
              ▼
    [ Zod Schema Validation ] 
              │
              ▼
   [ SQLite Directives Log ]  (Status: PENDING)
              │
              ▼
   [ Event: command.received ] 
              │
              ▼
    [ Routing Handler Map ] 
              │
      ┌───────┴───────┐
      ▼               ▼
 [ Success ]      [ Failure ]
      │               │
      ▼               ▼
 [ Update Log:   ] [ Update Log: ]
 [ COMPLETED     ] [ FAILED      ]
      │               │
      ▼               ▼
 [ Event:        ] [ Event:      ]
 [ command.exed  ] [ command.fail]
```

---

## 2. Command Registry & Handler Schema

Every command registered inside CommandOS requires:
1. A unique namespaced string (e.g. `"career.sync-linkedin"`).
2. A Zod validation schema definition for strict runtime verification of payloads.
3. An execution handler function returning a Promise.

```typescript
import { z } from 'zod';
import { SystemCommandDirective } from './10-Command-System'; // From Layer 1

export type CommandHandler<TInput = any, TOutput = any> = (
  payload: TInput,
  context: SystemCommandDirective['context']
) => Promise<TOutput>;

export interface CommandRegistration {
  command: string;
  schema: z.ZodSchema;
  handler: CommandHandler;
}
```

---

## 3. Strict Command Router Engine Blueprint

Below is the concrete implementation of the Command Engine Router featuring database audit log inserts and pipeline lifecycle events.

```typescript
import { SystemCommandDirective } from './10-Command-System';
import { ISystemEventBus } from './06-Event-System';

export class ProductionCommandRouter {
  private registry: Map<string, CommandRegistration> = new Map();
  private eventBus: ISystemEventBus;
  private db: any; // Relational Database Client wrapper (SQLite)

  constructor(eventBus: ISystemEventBus, dbClient: any) {
    this.eventBus = eventBus;
    this.db = dbClient;
  }

  public register(registration: CommandRegistration): void {
    if (this.registry.has(registration.command)) {
      throw new Error(`Command registration conflict: ${registration.command} already exists.`);
    }
    this.registry.set(registration.command, registration);
  }

  public async route(directive: SystemCommandDirective): Promise<any> {
    const startTime = Date.now();
    const registration = this.registry.get(directive.command);

    // 1. Check Routing Registry Existence
    if (!registration) {
      const routingErr = new Error(`Command execution error: ${directive.command} is not a valid endpoint.`);
      this.publishFailure(directive, routingErr, 0);
      throw routingErr;
    }

    // 2. Validate Payload Schema
    const parsedPayload = registration.schema.safeParse(directive.payload);
    if (!parsedPayload.success) {
      const validationErr = new Error(`Invalid command payload schema: ${parsedPayload.error.message}`);
      this.publishFailure(directive, validationErr, 0);
      throw validationErr;
    }

    // 3. Log Directive as PENDING in SQLite
    await this.logDirectiveToDb(directive, 'PENDING');

    // 4. Publish Event Bus Telemetry
    this.eventBus.publish({
      eventId: this.generateUuid(),
      transactionId: directive.transactionId,
      eventName: 'command.received',
      timestamp: new Date().toISOString(),
      payload: { command: directive.command },
      producer: 'CommandEngine'
    });

    try {
      // 5. Execute Registered Domain Handler (Pass validated payload)
      const result = await registration.handler(parsedPayload.data, directive.context);
      const duration = Date.now() - startTime;

      // 6. Log Execution Completion
      await this.updateDirectiveInDb(directive.transactionId, 'COMPLETED', duration);
      
      this.eventBus.publish({
        eventId: this.generateUuid(),
        transactionId: directive.transactionId,
        eventName: 'command.executed',
        timestamp: new Date().toISOString(),
        payload: { command: directive.command, durationMs: duration },
        producer: 'CommandEngine'
      });

      return result;
    } catch (err: any) {
      const duration = Date.now() - startTime;
      await this.updateDirectiveInDb(directive.transactionId, 'FAILED', duration, err.message);
      this.publishFailure(directive, err, duration);
      throw err;
    }
  }

  private publishFailure(directive: SystemCommandDirective, err: Error, duration: number): void {
    this.eventBus.publish({
      eventId: this.generateUuid(),
      transactionId: directive.transactionId,
      eventName: 'command.failed',
      timestamp: new Date().toISOString(),
      payload: { command: directive.command, error: err.message, durationMs: duration },
      producer: 'CommandEngine'
    });
  }

  private async logDirectiveToDb(directive: SystemCommandDirective, status: string): Promise<void> {
    await this.db.run(
      `INSERT INTO command_directives (transaction_id, command, timestamp, payload, user_id, trigger_source, bypass_cache, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        directive.transactionId,
        directive.command,
        directive.timestamp,
        JSON.stringify(directive.payload),
        directive.context.userId,
        directive.context.triggerSource,
        directive.context.bypassCache ? 1 : 0,
        status
      ]
    );
  }

  private async updateDirectiveInDb(txId: string, status: string, durationMs: number, errorMsg?: string): Promise<void> {
    await this.db.run(
      `UPDATE command_directives 
       SET status = ?, execution_duration_ms = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE transaction_id = ?`,
      [status, durationMs, errorMsg || null, txId]
    );
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
