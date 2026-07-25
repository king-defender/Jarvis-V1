import { describe, expect, it } from 'vitest';
import { SystemEventBus, createSystemEvent } from './event-bus.service.js';

describe('SystemEventBus', () => {
  it('publishes frozen payloads to named and wildcard subscribers', () => {
    const bus = new SystemEventBus();
    const seen: string[] = [];

    bus.subscribe('command.received', (event) => {
      seen.push(event.eventName);
      expect(Object.isFrozen(event.payload)).toBe(true);
    });
    bus.subscribe('*', (event) => {
      seen.push(`*:${event.eventName}`);
    });

    bus.publish(
      createSystemEvent({
        transactionId: '00000000-0000-4000-8000-000000000001',
        eventName: 'command.received',
        payload: { command: 'system.ping' },
        producer: 'test',
      }),
    );

    expect(seen).toEqual(['command.received', '*:command.received']);
  });
});
