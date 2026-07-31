import path from 'node:path';

/** Resolve `filePath` under `rootDir`; reject absolute/`..` escapes. */
export function resolveSandboxedPath(rootDir: string, filePath: string): string {
  const root = path.resolve(rootDir);
  const full = path.resolve(root, filePath);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (full !== root && !full.startsWith(rootWithSep)) {
    throw new Error(`Path escapes sandbox: ${filePath}`);
  }
  return full;
}
