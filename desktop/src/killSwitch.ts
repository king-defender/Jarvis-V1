import { app, globalShortcut, Tray, Menu, nativeImage } from 'electron';
import { execFileSync, type ChildProcess } from 'node:child_process';

/**
 * The kill switch. This is the one thing in the whole "give Jarvis system access" project
 * that must keep working even if the backend it launches is completely broken, hung, or has
 * edited its own code into a bad state - because it lives here, in the Electron shell, not
 * in `src/` where self-improvement (a later phase) is allowed to make changes. It does not
 * ask the backend to stop itself; it terminates the OS process from outside.
 *
 * Trigger it via the global hotkey (works even if no Jarvis window has focus) or the tray
 * menu's "Emergency Stop" item.
 */

const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Alt+Escape';

const trackedProcesses = new Set<ChildProcess>();
let tray: Tray | null = null;

/** Register a child process so the kill switch will forcibly terminate it. */
export function trackProcess(child: ChildProcess): void {
  trackedProcesses.add(child);
  child.once('exit', () => trackedProcesses.delete(child));
}

function forceKillPid(pid: number): void {
  try {
    if (process.platform === 'win32') {
      // /t kills the whole process tree, /f forces it. A plain child.kill() on Windows does
      // not reliably take down grandchildren - relevant once shell-exec / automation
      // sessions (later phases) spawn their own child processes under the backend.
      execFileSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    // Already gone is fine - the goal is "make sure it's dead," not "kill it exactly once."
  }
}

/** Kill every tracked process and quit. Safe to call more than once. */
export function killEverything(): void {
  console.log('[kill-switch] EMERGENCY STOP triggered');
  for (const child of trackedProcesses) {
    if (child.pid) forceKillPid(child.pid);
  }
  trackedProcesses.clear();

  app.quit();
  // Belt-and-suspenders: if a graceful quit hangs for any reason, force exit shortly after
  // so the kill switch never itself becomes the thing that's stuck.
  setTimeout(() => process.exit(0), 2000);
}

export interface KillSwitchOptions {
  /** Called from the tray's "Open Dashboard" item. */
  onShowWindow?: () => void;
  shortcut?: string;
}

export function registerKillSwitch(options: KillSwitchOptions = {}): void {
  const shortcut = options.shortcut ?? DEFAULT_SHORTCUT;
  const registered = globalShortcut.register(shortcut, killEverything);
  if (!registered) {
    console.warn(
      `[kill-switch] Could not register global shortcut "${shortcut}" (already in use?). ` +
        'The tray menu\'s "Emergency Stop" item still works.',
    );
  }

  // TODO: replace with a real icon asset before packaging a distributable build - an empty
  // image still renders (a default placeholder on most platforms) so the tray/menu exists
  // even without one, which is what actually matters for Phase 1.
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Jarvis');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Dashboard', click: () => options.onShowWindow?.() },
      { type: 'separator' },
      { label: '⛔ Emergency Stop', click: killEverything },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
}

export function unregisterKillSwitch(): void {
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
}
