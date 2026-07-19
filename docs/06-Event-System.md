# Event System

This document specifies the event-driven communication model, in-memory system event bus, and asynchronous task execution queue architecture of CommandOS.

---

## 1. Event Topology

CommandOS uses a hybrid event architecture:
1. **In-Process System Event Bus:** A synchronous/asynchronous in-memory event emitter used for local, non-blocking telemetry, logging, and decoupling.
2. **Out-of-Process Task Queue:** A Redis-backed job processor (e.g., BullMQ) for heavy, long-running, or resource-intensive tasks (like Playwright crawls or LLM evaluations).

```
[ Client Request ] 
       │
       ▼
[ Control Layer ] ──(Emits event)──> [ System Event Bus ] ──> [ Audit / Telemetry / Logs ]
       │                                     
       │ (Dispatch Async Command Directive)
       ▼
[ Task Queue (Redis) ] ────> [ Background Workers ] ────> [ SQLite State Update ]
```

---

## 2. Strict Event Payload Schema

All system events transmitted across modules must implement the `SystemEvent` interface:

```typescript
export interface SystemEvent<T = Record<string, any>> {
  eventId: string;          // Unique UUIDv4 event identifier
  transactionId: string;    // Relational tracking transaction UUIDv4
  eventName: string;        // Dot-notation namespaced event name: "module.entity.action"
  timestamp: string;        // ISO 8601 timestamp string
  payload: T;               // Deeply cloned, frozen data payload
  producer: string;         // The identifier of the producing module or service
}
```

---

## 3. In-Memory System Event Bus Contract

The system bus handles decoupled reactive triggers (e.g. updating dashboard statistics or archiving command logs without blocking API execution threads).

```typescript
import { EventEmitter } from 'events';

export interface ISystemEventBus {
  publish(event: SystemEvent): void;
  subscribe(eventName: string, handler: (event: SystemEvent) => void): void;
  unsubscribe(eventName: string, handler: (event: SystemEvent) => void): void;
}

export class SystemEventBus implements ISystemEventBus {
  private emitter: EventEmitter = new EventEmitter();

  constructor() {
    // Increase maximum listener count to prevent leak warnings on heavy scaling
    this.emitter.setMaxListeners(100);
  }

  public publish(event: SystemEvent): void {
    // Enforce payload immutability before publishing
    const frozenEvent = Object.freeze({
      ...event,
      payload: Object.freeze(JSON.parse(JSON.stringify(event.payload)))
    });
    
    this.emitter.emit(frozenEvent.eventName, frozenEvent);
    this.emitter.emit('*', frozenEvent); // Global wildcard listener for auditing/logs
  }

  public subscribe(eventName: string, handler: (event: SystemEvent) => void): void {
    this.emitter.on(eventName, handler);
  }

  public unsubscribe(eventName: string, handler: (event: SystemEvent) => void): void {
    this.emitter.off(eventName, handler);
  }
}
```

---

## 4. Asynchronous Task Queue Spec (Redis Backed)

Long-running tasks are pushed to a Redis queue called `command_os_task_queue` to ensure resilience and protect control gateway endpoints from timeouts.

### Queue Payload Contract
```typescript
export interface QueuedTaskJob {
  transactionId: string;
  taskId: string;            // UUID of the task instance in SQLite
  workflowId: string;        // Parent workflow UUID
  command: string;           // Target command name
  payload: Record<string, any>;
  retryAttempts: number;     // Remaining retries
}
```

### Job Processing Lifecycle
1. **Enqueue:** The Orchestration Engine inserts a `QueuedTaskJob` into the queue and marks the SQLite task row status as `PENDING`.
2. **Locking & Execution:** A worker grabs the job, sets the SQLite task status to `RUNNING`, and triggers the Command Engine dispatch route.
3. **Completion:** Upon successful run, the SQLite task is set to `COMPLETED` and a `workflow.task_completed` event is fired.
4. **Retry & Backoff:** If the execution fails:
   * Subtract one retry attempt.
   * If `retryAttempts > 0`, re-enqueue the job with an exponential backoff factor (e.g., `initialDelay * 2^attempt`).
   * If `retryAttempts === 0`, update task status in SQLite to `FAILED` and raise a `workflow.task_failed` event on the system bus.

---

## 5. Core System Events Directory

| Event Name | Producer | Subscribed Consumers | Purpose |
| --- | --- | --- | --- |
| `command.received` | Command Gateway | Audit Logger | Ingress command logging |
| `command.executed` | Command Router | System Stats | Successful execution tracking |
| `command.failed` | Command Router | Notification Engine | Alerting on execution crash |
| `workflow.started` | Workflow Engine | Database Sync | Updates workflow states |
| `workflow.completed` | Workflow Engine | Database Sync, Event Bus | Workflow completion trigger |
| `workflow.step_failed`| Workflow Engine | ModelRouter (Fallback) | Triggers intelligence degradation / retries |
