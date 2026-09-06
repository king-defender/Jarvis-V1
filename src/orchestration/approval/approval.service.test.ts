import { describe, expect, it } from 'vitest';
import { ApprovalService } from './approval.service.js';
import type { IStorageService } from '../../infrastructure/services/storage.service.js';
import type { ISystemEventBus } from '../../infrastructure/services/event-bus.service.js';

const fakeStorage = {} as IStorageService;
const fakeEventBus = {} as ISystemEventBus;

describe('ApprovalService.requiresApproval', () => {
  const service = new ApprovalService(fakeStorage, fakeEventBus);

  it('gates every command under the system.* namespace (Phases 2-5)', () => {
    expect(service.requiresApproval('system.fs-write')).toBe(true);
    expect(service.requiresApproval('system.fs-delete')).toBe(true);
    expect(service.requiresApproval('system.run-shell')).toBe(true);
    expect(service.requiresApproval('system.launch-app')).toBe(true);
    expect(service.requiresApproval('system.close-app')).toBe(true);
    expect(service.requiresApproval('system.automate-input')).toBe(true);
  });

  it('gates platform.self-edit regardless of the auto-apply config default', () => {
    expect(service.requiresApproval('platform.self-edit')).toBe(true);
  });

  it('does not gate unrelated low-risk commands', () => {
    expect(service.requiresApproval('system.ping')).toBe(true); // still system.* on purpose
    expect(service.requiresApproval('platform.ai-status')).toBe(false);
    expect(service.requiresApproval('assistant.chat')).toBe(false);
  });
});
