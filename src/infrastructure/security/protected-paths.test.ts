import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertPathAllowed, ProtectedPathError } from './protected-paths.js';

const repoRoot = path.resolve(process.cwd());

describe('assertPathAllowed', () => {
  it('blocks the desktop/ kill-switch directory', () => {
    expect(() => assertPathAllowed(path.join(repoRoot, 'desktop', 'killSwitch.ts'))).toThrow(
      ProtectedPathError,
    );
  });

  it('blocks git internals', () => {
    expect(() => assertPathAllowed(path.join(repoRoot, '.git', 'config'))).toThrow(
      ProtectedPathError,
    );
  });

  it('blocks node_modules', () => {
    expect(() =>
      assertPathAllowed(path.join(repoRoot, 'node_modules', 'some-pkg', 'index.js')),
    ).toThrow(ProtectedPathError);
  });

  it('blocks itself, so self-improvement cannot edit its own guard away', () => {
    const self = path.resolve(
      repoRoot,
      'src',
      'infrastructure',
      'security',
      'protected-paths.ts',
    );
    expect(() => assertPathAllowed(self)).toThrow(ProtectedPathError);
  });

  it('allows a normal data path', () => {
    expect(() =>
      assertPathAllowed(path.join(repoRoot, 'data', 'scaffolds', 'x.ts')),
    ).not.toThrow();
  });

  it('allows an ordinary src file that is not the guard itself', () => {
    expect(() =>
      assertPathAllowed(path.join(repoRoot, 'src', 'domain', 'modules', 'system', 'foo.ts')),
    ).not.toThrow();
  });
});
