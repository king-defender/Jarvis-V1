import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { CommandRegistration } from '../../../shared/types/command.types.js';
import {
  assertPathAllowed,
  ProtectedPathError,
} from '../../../infrastructure/security/protected-paths.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../../infrastructure/services/event-bus.service.js';

const PingPayloadSchema = z.object({
  message: z.string().default('pong'),
});

const MAX_READ_BYTES = 10 * 1024 * 1024;
const MAX_SHELL_OUTPUT_CHARS = 200_000;
const DEFAULT_SHELL_TIMEOUT_MS = 60_000;
const MAX_SHELL_TIMEOUT_MS = 300_000;

// ---- Phase 2: broad file access ----------------------------------------------------------

const FsReadSchema = z.object({
  path: z.string().min(1),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
});

const FsWriteSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
});

const FsDeleteSchema = z.object({
  path: z.string().min(1),
  recursive: z.boolean().default(false),
});

// ---- Phase 3: app control ----------------------------------------------------------------

const LaunchAppSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
});

const CloseAppSchema = z
  .object({
    pid: z.number().int().positive().optional(),
    processName: z.string().min(1).optional(),
  })
  .refine((v) => v.pid !== undefined || v.processName !== undefined, {
    message: 'Provide either pid or processName',
  });

const ListProcessesSchema = z.object({
  filter: z.string().optional(),
});

// ---- Phase 4: shell execution ------------------------------------------------------------

const RunShellSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(MAX_SHELL_TIMEOUT_MS)
    .default(DEFAULT_SHELL_TIMEOUT_MS),
});

// ---- Phase 5: mouse/keyboard automation --------------------------------------------------

const AutomateInputActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), x: z.number().int(), y: z.number().int() }),
  z.object({
    type: z.literal('click'),
    button: z.enum(['left', 'right', 'double']).default('left'),
    x: z.number().int().optional(),
    y: z.number().int().optional(),
  }),
  z.object({ type: z.literal('type'), text: z.string().max(5000) }),
  z.object({ type: z.literal('key'), keys: z.string().min(1).max(200) }),
  z.object({ type: z.literal('wait'), ms: z.number().int().positive().max(10_000) }),
]);

const AutomateInputSchema = z.object({
  actions: z.array(AutomateInputActionSchema).min(1).max(50),
});

type AutomateInputAction = z.infer<typeof AutomateInputActionSchema>;

/**
 * Built-in system commands: health/smoke (Sprint 1), then the broad-system-access phases
 * (file access anywhere, app control, shell execution, input automation). Every command in
 * this module lives under the `system.*` namespace, which ApprovalService gates entirely -
 * see approval.service.ts - so nothing here executes without a human approving it first.
 * Control layer registers these; domain never imports control.
 */
export function getSystemCommandRegistrations(deps: {
  eventBus: ISystemEventBus;
}): CommandRegistration[] {
  return [
    {
      command: 'system.ping',
      schema: PingPayloadSchema,
      handler: async (payload: z.infer<typeof PingPayloadSchema>) => {
        return {
          ok: true,
          echo: payload.message,
          at: new Date().toISOString(),
        };
      },
    },

    // -- Phase 2: broad file access ------------------------------------------------------
    {
      command: 'system.fs-read',
      schema: FsReadSchema,
      handler: async (payload: z.infer<typeof FsReadSchema>) => {
        const target = path.resolve(payload.path);
        const stat = await fs.stat(target);
        if (stat.isDirectory()) {
          const entries = await fs.readdir(target, { withFileTypes: true });
          return {
            path: target,
            isDirectory: true,
            entries: entries.map((e) => ({
              name: e.name,
              isDirectory: e.isDirectory(),
            })),
          };
        }
        if (stat.size > MAX_READ_BYTES) {
          throw new Error(
            `File too large to read in one call: ${stat.size} bytes (limit ${MAX_READ_BYTES})`,
          );
        }
        const buffer = await fs.readFile(target);
        return {
          path: target,
          isDirectory: false,
          sizeBytes: stat.size,
          encoding: payload.encoding,
          content: buffer.toString(payload.encoding),
        };
      },
    },
    {
      command: 'system.fs-write',
      schema: FsWriteSchema,
      handler: async (payload: z.infer<typeof FsWriteSchema>, context) => {
        const target = path.resolve(payload.path);
        assertPathAllowed(target);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const buffer = Buffer.from(payload.content, payload.encoding);
        await fs.writeFile(target, buffer);
        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'system.fs_write',
            payload: { path: target, bytesWritten: buffer.length, userId: context.userId },
            producer: 'SystemModule',
          }),
        );
        return { path: target, bytesWritten: buffer.length };
      },
    },
    {
      command: 'system.fs-delete',
      schema: FsDeleteSchema,
      handler: async (payload: z.infer<typeof FsDeleteSchema>, context) => {
        const target = path.resolve(payload.path);
        assertPathAllowed(target);
        await fs.rm(target, { recursive: payload.recursive, force: false });
        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'system.fs_delete',
            payload: { path: target, recursive: payload.recursive, userId: context.userId },
            producer: 'SystemModule',
          }),
        );
        return { path: target, deleted: true };
      },
    },

    // -- Phase 3: app control -------------------------------------------------------------
    {
      command: 'system.launch-app',
      schema: LaunchAppSchema,
      handler: async (payload: z.infer<typeof LaunchAppSchema>, context) => {
        const child = spawn(payload.command, payload.args, {
          cwd: payload.cwd ? path.resolve(payload.cwd) : undefined,
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        });
        child.unref();
        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'system.app_launched',
            payload: { command: payload.command, args: payload.args, pid: child.pid, userId: context.userId },
            producer: 'SystemModule',
          }),
        );
        return { pid: child.pid ?? null };
      },
    },
    {
      command: 'system.close-app',
      schema: CloseAppSchema,
      handler: async (payload: z.infer<typeof CloseAppSchema>, context) => {
        if (payload.pid !== undefined && payload.pid === process.pid) {
          throw new Error('Refusing to close the Jarvis backend process itself via system.close-app.');
        }
        await closeApp(payload);
        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'system.app_closed',
            payload: { pid: payload.pid, processName: payload.processName, userId: context.userId },
            producer: 'SystemModule',
          }),
        );
        return { closed: true };
      },
    },
    {
      command: 'system.list-processes',
      schema: ListProcessesSchema,
      handler: async (payload: z.infer<typeof ListProcessesSchema>) => {
        const processes = await listProcesses();
        const filter = payload.filter?.toLowerCase();
        const filtered = filter
          ? processes.filter((p) => p.name.toLowerCase().includes(filter))
          : processes;
        return { processes: filtered.slice(0, 500), count: filtered.length };
      },
    },

    // -- Phase 4: shell execution ----------------------------------------------------------
    {
      command: 'system.run-shell',
      schema: RunShellSchema,
      handler: async (payload: z.infer<typeof RunShellSchema>, context) => {
        const cwd = payload.cwd ? path.resolve(payload.cwd) : process.cwd();
        for (const candidate of extractPathCandidates(payload.command)) {
          try {
            assertPathAllowed(path.resolve(cwd, candidate));
          } catch (error) {
            if (error instanceof ProtectedPathError) throw error;
          }
        }
        const result = await runShellProcess(payload.command, cwd, payload.timeoutMs);
        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'system.shell_executed',
            payload: {
              command: payload.command,
              exitCode: result.code,
              timedOut: result.timedOut,
              userId: context.userId,
            },
            producer: 'SystemModule',
          }),
        );
        return result;
      },
    },

    // -- Phase 5: mouse/keyboard automation -------------------------------------------------
    {
      command: 'system.automate-input',
      schema: AutomateInputSchema,
      handler: async (payload: z.infer<typeof AutomateInputSchema>, context) => {
        if (process.platform !== 'win32') {
          throw new Error('system.automate-input is only implemented for Windows in this build.');
        }
        await runInputAutomation(payload.actions);
        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'system.input_automated',
            payload: { actionCount: payload.actions.length, userId: context.userId },
            producer: 'SystemModule',
          }),
        );
        return { executed: payload.actions.length };
      },
    },
  ];
}

// ---- helpers --------------------------------------------------------------------------

async function closeApp(payload: { pid?: number | undefined; processName?: string | undefined }): Promise<void> {
  if (process.platform === 'win32') {
    const args = payload.pid !== undefined
      ? ['/PID', String(payload.pid), '/F', '/T']
      : ['/IM', payload.processName!, '/F'];
    await execFileAsync('taskkill', args);
    return;
  }
  if (payload.pid !== undefined) {
    process.kill(payload.pid, 'SIGKILL');
    return;
  }
  await execFileAsync('pkill', ['-9', payload.processName!]);
}

async function listProcesses(): Promise<Array<{ pid: number; name: string }>> {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH']);
    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const fields = line.split('","').map((f) => f.replace(/^"|"$/g, ''));
        return { name: fields[0] ?? '', pid: Number(fields[1] ?? 0) };
      })
      .filter((p) => p.name);
  }
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid,comm']);
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const trimmed = line.trim();
      const spaceIdx = trimmed.indexOf(' ');
      return {
        pid: Number(trimmed.slice(0, spaceIdx)),
        name: trimmed.slice(spaceIdx + 1).trim(),
      };
    });
}

function execFileAsync(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function extractPathCandidates(command: string): string[] {
  const candidates = new Set<string>();
  const quoted = command.match(/"([^"]+)"|'([^']+)'/g) ?? [];
  for (const q of quoted) candidates.add(q.slice(1, -1));
  for (const token of command.split(/\s+/)) {
    const stripped = token.replace(/^["']|["']$/g, '');
    if (/[\\/]/.test(stripped) || /^[a-zA-Z]:/.test(stripped)) candidates.add(stripped);
  }
  return [...candidates];
}

function runShellProcess(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // On Windows, shell:true spawns the command inside a cmd.exe wrapper - SIGKILLing
      // that wrapper alone leaves the actual child process running. /T kills the whole tree.
      if (process.platform === 'win32' && child.pid) {
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {});
      } else {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < MAX_SHELL_OUTPUT_CHARS) stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < MAX_SHELL_OUTPUT_CHARS) stderr += d.toString();
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: stdout.slice(0, MAX_SHELL_OUTPUT_CHARS),
        stderr: stderr.slice(0, MAX_SHELL_OUTPUT_CHARS),
        timedOut,
      });
    });
    child.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: `${stderr}\n${err.message}`, timedOut });
    });
  });
}

/**
 * Windows-only mouse/keyboard automation via a generated PowerShell script (SetCursorPos +
 * mouse_event through a small inline P/Invoke type, SendKeys for typing/key sequences).
 * Deliberately not a native node module (nut.js/robotjs, etc): those need node-gyp/prebuild
 * validation per machine and Node version before you can trust them, which the desktop
 * shell's own install already showed can silently half-fail. SendKeys is proven working in
 * this exact environment - it's what triggers the kill switch's global hotkey - so building
 * on it here avoids a whole class of native-module risk for a Windows-only target.
 */
async function runInputAutomation(actions: AutomateInputAction[]): Promise<void> {
  const script = buildAutomationScript(actions);
  const tmpFile = path.join(os.tmpdir(), `jarvis-input-${randomUUID()}.ps1`);
  await fs.writeFile(tmpFile, script, 'utf8');
  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      tmpFile,
    ]);
  } finally {
    await fs.rm(tmpFile, { force: true });
  }
}

function buildAutomationScript(actions: AutomateInputAction[]): string {
  const lines: string[] = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class JarvisNativeInput {',
    '  [DllImport("user32.dll")]',
    '  public static extern bool SetCursorPos(int x, int y);',
    '  [DllImport("user32.dll")]',
    '  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);',
    '}',
    '"@',
  ];

  const MOUSEEVENTF_LEFTDOWN = 0x0002;
  const MOUSEEVENTF_LEFTUP = 0x0004;
  const MOUSEEVENTF_RIGHTDOWN = 0x0008;
  const MOUSEEVENTF_RIGHTUP = 0x0010;

  const click = (down: number, up: number) => {
    lines.push(`[JarvisNativeInput]::mouse_event(${down},0,0,0,[UIntPtr]::Zero)`);
    lines.push('Start-Sleep -Milliseconds 30');
    lines.push(`[JarvisNativeInput]::mouse_event(${up},0,0,0,[UIntPtr]::Zero)`);
  };

  for (const action of actions) {
    switch (action.type) {
      case 'move':
        lines.push(`[JarvisNativeInput]::SetCursorPos(${action.x}, ${action.y})`);
        break;
      case 'click':
        if (action.x !== undefined && action.y !== undefined) {
          lines.push(`[JarvisNativeInput]::SetCursorPos(${action.x}, ${action.y})`);
        }
        if (action.button === 'right') {
          click(MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP);
        } else if (action.button === 'double') {
          click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP);
          lines.push('Start-Sleep -Milliseconds 60');
          click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP);
        } else {
          click(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP);
        }
        break;
      case 'type':
        lines.push(`[System.Windows.Forms.SendKeys]::SendWait(${psSingleQuote(escapeSendKeysText(action.text))})`);
        break;
      case 'key':
        lines.push(`[System.Windows.Forms.SendKeys]::SendWait(${psSingleQuote(action.keys)})`);
        break;
      case 'wait':
        lines.push(`Start-Sleep -Milliseconds ${action.ms}`);
        break;
    }
  }

  return lines.join('\n');
}

function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function escapeSendKeysText(text: string): string {
  return text.replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`);
}
