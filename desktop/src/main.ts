import { app, BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { registerKillSwitch, trackProcess, unregisterKillSwitch } from './killSwitch';
import { startIntegrityWatchdog, type WatchdogHandle } from './integrityWatchdog';

// desktop/dist/main.js -> up two levels -> repo root.
const repoRoot = path.resolve(__dirname, '..', '..');
const backendEntry = path.join(repoRoot, 'dist', 'src', 'app.js');
const port = process.env.PORT || '8080';
const dashboardUrl = `http://localhost:${port}/dashboard/`;
const healthUrl = `http://localhost:${port}/api/health`;

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let watchdog: WatchdogHandle | null = null;

function startBackend(): ChildProcess {
  const child = spawn(process.execPath, [backendEntry], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  child.on('error', (err) => {
    console.error('[desktop] Failed to start backend:', err);
  });
  trackProcess(child);
  return child;
}

async function waitForHealth(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `Backend did not become healthy at ${url} within ${timeoutMs}ms: ${String(lastError)}`,
  );
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Jarvis',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await mainWindow.loadURL(dashboardUrl);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

export function showWindow(): void {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    void createWindow();
  }
}

app.whenReady().then(async () => {
  backendProcess = startBackend();
  registerKillSwitch({ onShowWindow: showWindow });
  watchdog = startIntegrityWatchdog();

  try {
    await waitForHealth(healthUrl);
  } catch (err) {
    console.error('[desktop]', err);
    console.error(
      '[desktop] Opening the window anyway - the dashboard will show a connection error ' +
        'until the backend catches up. Check the terminal output above for why it did not start.',
    );
  }

  await createWindow();
});

app.on('window-all-closed', () => {
  // A personal assistant shouldn't die just because its window was closed - keep the backend
  // running in the tray. Use the tray menu or the kill switch to actually stop it.
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on('before-quit', () => {
  watchdog?.stop();
  unregisterKillSwitch();
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});
