import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { killEverything } from './killSwitch';

/**
 * Layer 2 of the kill-switch defense. protected-paths.ts (in the backend) only stops writes
 * that go through Jarvis's own structured commands - it does nothing against a raw shell
 * command (a capability the backend is meant to have) touching the same files directly. This
 * watchdog closes that gap by detection-and-response instead of prevention: it hashes every
 * protected file on an interval and, the moment one doesn't match its last known-good hash,
 * assumes something is tampering with the safety system and kills everything immediately -
 * no approval, no delay, no code path that anything in `src/` can influence, because this
 * file (like the rest of `desktop/`) never runs as part of the backend process.
 *
 * This detects tampering within one interval, it does not prevent it outright - see
 * desktop/scripts/lockdown.ps1 for the OS-level layer that does prevent it (for
 * non-elevated processes; nothing in userland can stop an elevated/admin shell command,
 * and this file does not pretend otherwise).
 */

const repoRoot = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(__dirname, '..', 'integrity-manifest.json');

// Compiled output is what actually runs, so that's what gets hashed - editing the .ts source
// without rebuilding doesn't change runtime behavior, but editing dist/ does.
const PROTECTED_FILES = [
  path.join(repoRoot, 'desktop', 'dist', 'main.js'),
  path.join(repoRoot, 'desktop', 'dist', 'killSwitch.js'),
  path.join(repoRoot, 'desktop', 'dist', 'integrityWatchdog.js'),
  path.join(repoRoot, 'dist', 'src', 'infrastructure', 'security', 'protected-paths.js'),
  path.join(repoRoot, 'dist', 'src', 'orchestration', 'approval', 'approval.service.js'),
];

type Manifest = Record<string, string>;

function hashFile(filePath: string): string | null {
  try {
    const contents = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(contents).digest('hex');
  } catch {
    // Missing entirely counts as tampered, not "skip" - a deleted guard is exactly the
    // failure mode this exists to catch.
    return null;
  }
}

function computeCurrentHashes(): Manifest {
  const manifest: Manifest = {};
  for (const file of PROTECTED_FILES) {
    manifest[file] = hashFile(file) ?? '<missing>';
  }
  return manifest;
}

function loadManifest(): Manifest | null {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

function saveManifest(manifest: Manifest): void {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

export interface WatchdogHandle {
  stop: () => void;
}

/**
 * Starts the watchdog. On first run (no manifest yet) it records the current hashes as the
 * trusted baseline and says so loudly - that baseline is only trustworthy if you run this
 * right after a clean build you trust, which is why `npm run build` prints a reminder.
 */
export function startIntegrityWatchdog(intervalMs = 5000): WatchdogHandle {
  let manifest = loadManifest();

  if (!manifest) {
    manifest = computeCurrentHashes();
    saveManifest(manifest);
    console.log(
      '[integrity] No baseline found - recording current file hashes as trusted. ' +
        'This is expected on first run after a build; if you did not just build this ' +
        'yourself, delete desktop/integrity-manifest.json and rebuild before trusting it.',
    );
  }

  const trusted = manifest;

  const timer = setInterval(() => {
    const current = computeCurrentHashes();
    for (const file of PROTECTED_FILES) {
      if (current[file] !== trusted[file]) {
        console.error(
          `[integrity] TAMPER DETECTED: ${file} changed since the trusted baseline. ` +
            'Triggering emergency stop.',
        );
        clearInterval(timer);
        killEverything();
        return;
      }
    }
  }, intervalMs);
  // Don't let this timer alone keep the process alive if everything else has shut down.
  timer.unref();

  return {
    stop: () => clearInterval(timer),
  };
}

/** Call after an intentional, trusted rebuild of the protected files to re-baseline. */
export function rebaselineIntegrityManifest(): void {
  saveManifest(computeCurrentHashes());
  console.log('[integrity] Baseline re-recorded from current files.');
}
