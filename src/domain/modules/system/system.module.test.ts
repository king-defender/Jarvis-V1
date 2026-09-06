import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getSystemCommandRegistrations } from './system.module.js';
import type { ISystemEventBus, SystemEvent } from '../../../infrastructure/services/event-bus.service.js';
import type { CommandContext } from '../../../shared/types/command.types.js';

function fakeEventBus(): ISystemEventBus {
  return {
    publish: (_event: SystemEvent) => {},
    subscribe: () => {},
    unsubscribe: () => {},
  };
}

function findCommand(command: string) {
  const registrations = getSystemCommandRegistrations({ eventBus: fakeEventBus() });
  const found = registrations.find((r) => r.command === command);
  if (!found) throw new Error(`Command not registered: ${command}`);
  return found;
}

const ctx: CommandContext = { userId: 'test-user', triggerSource: 'CLI', bypassCache: false };

describe('system module - Phase 2 file access', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-system-fs-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes then reads a file back', async () => {
    const target = path.join(tmpDir, 'note.txt');
    const write = findCommand('system.fs-write');
    const writeResult = (await write.handler(
      { path: target, content: 'hello jarvis', encoding: 'utf8' },
      ctx,
    )) as { path: string; bytesWritten: number };
    expect(writeResult.bytesWritten).toBe(Buffer.byteLength('hello jarvis'));

    const read = findCommand('system.fs-read');
    const readResult = (await read.handler({ path: target, encoding: 'utf8' }, ctx)) as {
      content: string;
      isDirectory: boolean;
    };
    expect(readResult.isDirectory).toBe(false);
    expect(readResult.content).toBe('hello jarvis');
  });

  it('deletes a file', async () => {
    const target = path.join(tmpDir, 'delete-me.txt');
    await fs.writeFile(target, 'x');
    const del = findCommand('system.fs-delete');
    await del.handler({ path: target, recursive: false }, ctx);
    await expect(fs.access(target)).rejects.toThrow();
  });

  it('refuses to write inside desktop/ (protected path)', async () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const target = path.join(repoRoot, 'desktop', 'should-not-write.txt');
    const write = findCommand('system.fs-write');
    await expect(write.handler({ path: target, content: 'x', encoding: 'utf8' }, ctx)).rejects.toThrow(
      /Refusing to write\/delete a protected path/,
    );
  });

  it('refuses to overwrite protected-paths.ts itself', async () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const target = path.join(repoRoot, 'src', 'infrastructure', 'security', 'protected-paths.ts');
    const write = findCommand('system.fs-write');
    await expect(write.handler({ path: target, content: 'x', encoding: 'utf8' }, ctx)).rejects.toThrow(
      /Refusing to write\/delete a protected path/,
    );
  });
});

describe('system module - Phase 3 app control', () => {
  it('refuses to close its own backend process', async () => {
    const closeApp = findCommand('system.close-app');
    await expect(closeApp.handler({ pid: process.pid }, ctx)).rejects.toThrow(
      /Refusing to close the Jarvis backend process itself/,
    );
  });

  it('launches a short-lived process and reports a pid', async () => {
    const launch = findCommand('system.launch-app');
    const result = (await launch.handler(
      { command: process.execPath, args: ['-e', 'setTimeout(() => {}, 3000)'] },
      ctx,
    )) as { pid: number | null };
    expect(result.pid).toBeGreaterThan(0);

    const closeApp = findCommand('system.close-app');
    await closeApp.handler({ pid: result.pid! }, ctx);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(() => process.kill(result.pid!, 0)).toThrow();
  });

  it('lists running processes with name and pid', async () => {
    const list = findCommand('system.list-processes');
    const result = (await list.handler({}, ctx)) as {
      processes: Array<{ pid: number; name: string }>;
    };
    expect(result.processes.length).toBeGreaterThan(0);
    expect(result.processes[0]).toHaveProperty('pid');
    expect(result.processes[0]).toHaveProperty('name');
  });
});

describe('system module - Phase 4 shell execution', () => {
  it('runs a command and captures stdout', async () => {
    const run = findCommand('system.run-shell');
    const result = (await run.handler(
      { command: `"${process.execPath}" -e "console.log(1+1)"`, timeoutMs: 15_000 },
      ctx,
    )) as { code: number | null; stdout: string; timedOut: boolean };
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('2');
  });

  it('kills a command that exceeds its timeout', async () => {
    const run = findCommand('system.run-shell');
    const result = (await run.handler(
      { command: `"${process.execPath}" -e "setTimeout(() => {}, 60000)"`, timeoutMs: 500 },
      ctx,
    )) as { timedOut: boolean };
    expect(result.timedOut).toBe(true);
  }, 15_000);

  it('refuses a command that references a protected path', async () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const protectedFile = path.join(repoRoot, 'src', 'orchestration', 'approval', 'approval.service.ts');
    const run = findCommand('system.run-shell');
    await expect(
      run.handler({ command: `type "${protectedFile}"`, timeoutMs: 5000 }, ctx),
    ).rejects.toThrow(/Refusing to write\/delete a protected path/);
  });
});
