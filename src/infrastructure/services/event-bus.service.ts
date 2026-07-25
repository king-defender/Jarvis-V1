import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export interface SystemEvent<T = Record<string, unknown>> {
  eventId: string;
  transactionId: string;
  eventName: string;
  timestamp: string;
  payload: T;
  producer: string;
}

export interface ISystemEventBus {
  publish(event: SystemEvent): void;
  subscribe(eventName: string, handler: (event: SystemEvent) => void): void;
  unsubscribe(eventName: string, handler: (event: SystemEvent) => void): void;
}

export function createSystemEvent<T extends Record<string, unknown>>(input: {
  transactionId: string;
  eventName: string;
  payload: T;
  producer: string;
}): SystemEvent<T> {
  return {
    eventId: randomUUID(),
    transactionId: input.transactionId,
    eventName: input.eventName,
    timestamp: new Date().toISOString(),
    payload: input.payload,
    producer: input.producer,
  };
}

export class SystemEventBus implements ISystemEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(event: SystemEvent): void {
    const frozenEvent = Object.freeze({
      ...event,
      payload: Object.freeze(JSON.parse(JSON.stringify(event.payload))) as Record<
        string,
        unknown
      >,
    }) as SystemEvent;

    this.emitter.emit(frozenEvent.eventName, frozenEvent);
    this.emitter.emit('*', frozenEvent);
  }

  subscribe(eventName: string, handler: (event: SystemEvent) => void): void {
    this.emitter.on(eventName, handler);
  }

  unsubscribe(eventName: string, handler: (event: SystemEvent) => void): void {
    this.emitter.off(eventName, handler);
  }
}
