import fs from 'node:fs';
import path from 'node:path';

// This file compiles to CommonJS (no "type": "module" in package.json), so __dirname is
// available directly - it points at src/infrastructure/security under ts-node/vitest, and at
// dist/src/infrastructure/security when compiled. resolveRepoRoot() walks up to the nearest
// package.json rather than hardcoding a directory depth, so it resolves correctly from both.
const moduleDir = __dirname;
const repoRoot = resolveRepoRoot(moduleDir);

function resolveRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: shouldn't happen in practice, but never leave repoRoot undefined.
  return startDir;
}

/**
 * Paths no command may ever write to or delete, regardless of what capability granted the
 * write (broad filesystem access, shell exec, or self-improvement). This is the one guard
 * that makes "Jarvis can edit its own code" survivable: the kill switch lives in `desktop/`,
 * outside `src/`, specifically so this list can protect it even from Jarvis's own
 * self-improvement feature. Keep this list short, obvious, and covered by
 * protected-paths.test.ts — every entry here is a load-bearing safety property, not a
 * style preference.
 */
const PROTECTED_DIRS = [
  path.join(repoRoot, 'desktop'),
  path.join(repoRoot, '.git'),
  path.join(repoRoot, 'node_modules'),
];

const approvalDir = path.join(repoRoot, 'src', 'orchestration', 'approval');

const PROTECTED_FILES = [
  // Never let anything (including self-improvement) edit this guard out of existence.
  path.resolve(moduleDir, 'protected-paths.ts'),
  path.resolve(moduleDir, 'protected-paths.js'),
  // Nor the approval gate itself - self-improvement editing this file is exactly the
  // "Jarvis quietly disables its own oversight" scenario this whole layer exists to stop.
  path.join(approvalDir, 'approval.service.ts'),
  path.join(approvalDir, 'approval.service.js'),
];

export class ProtectedPathError extends Error {
  constructor(target: string) {
    super(`Refusing to write/delete a protected path: ${target}`);
    this.name = 'ProtectedPathError';
  }
}

/** Throws ProtectedPathError if `targetPath` is (or is inside) a protected location. */
export function assertPathAllowed(targetPath: string): void {
  const resolved = path.resolve(targetPath);

  for (const file of PROTECTED_FILES) {
    if (resolved === file) {
      throw new ProtectedPathError(targetPath);
    }
  }

  for (const dir of PROTECTED_DIRS) {
    const dirWithSep = dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`;
    if (resolved === dir || resolved.startsWith(dirWithSep)) {
      throw new ProtectedPathError(targetPath);
    }
  }
}
