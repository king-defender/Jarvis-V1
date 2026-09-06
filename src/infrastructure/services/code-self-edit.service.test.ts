import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodeSelfEditService } from './code-self-edit.service.js';
import type { IStorageService } from './storage.service.js';
import type { ModelRouterService } from '../ai/model-router.service.js';

const fakeStorage = {} as IStorageService;
const fakeModelRouter = {} as ModelRouterService;

describe('CodeSelfEditService.resolveSafeRelative', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const service = new CodeSelfEditService(repoRoot, fakeStorage, fakeModelRouter);

  it('allows a normal source file under the allowlist', () => {
    expect(() => service.resolveSafeRelative('src/domain/modules/system/system.module.ts')).not.toThrow();
  });

  it('rejects the approval gate even though it is under the allowed src/ prefix', () => {
    // This is the exact loophole the extra assertPathAllowed() call closes: without it,
    // approval.service.ts passes the plain prefix allowlist because it's under src/.
    expect(() =>
      service.resolveSafeRelative('src/orchestration/approval/approval.service.ts'),
    ).toThrow(/Refusing to write\/delete a protected path/);
  });

  it('rejects protected-paths.ts itself for the same reason', () => {
    expect(() =>
      service.resolveSafeRelative('src/infrastructure/security/protected-paths.ts'),
    ).toThrow(/Refusing to write\/delete a protected path/);
  });

  it('still rejects paths outside the allowlist entirely', () => {
    expect(() => service.resolveSafeRelative('desktop/src/killSwitch.ts')).toThrow(
      /outside self-edit allowlist/,
    );
  });

  it('still rejects .env and path traversal', () => {
    expect(() => service.resolveSafeRelative('src/../.env')).toThrow();
    expect(() => service.resolveSafeRelative('src/../../etc/passwd')).toThrow();
  });
});
