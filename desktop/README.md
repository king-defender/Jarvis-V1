# Jarvis Desktop Shell

Electron wrapper around the existing Jarvis backend (`../src`). It exists for one reason
beyond convenience: **the kill switch has to work even if the backend it launches is broken,
hung, or has edited its own code into a bad state.** That's only possible if the kill switch
lives outside the part of the system that's allowed to change itself — this folder.

## The four layers, honestly

| Layer | What it does | What it actually stops |
|---|---|---|
| **1. Kill switch** (`killSwitch.ts`) | Global hotkey + tray "Emergency Stop", SIGKILLs the backend by PID from outside it | Lets *you* stop everything instantly, regardless of what state the backend is in |
| **2. Integrity watchdog** (`integrityWatchdog.ts`) | Hashes protected files every 5s; the instant one changes, triggers the kill switch automatically | Catches tampering within seconds and responds without waiting for you to notice |
| **3. OS-level lockdown** (`scripts/lockdown.ps1`) | Denies write/delete on this whole folder via Windows ACLs | Actually *prevents* a non-elevated process (including a shell command Jarvis runs) from touching these files at all |
| **4. Git history** (`platform.self-edit`) | Self-modifications land as a git commit, never a direct overwrite | `git revert` as a second, independent recovery path |

Self-improvement is real now, not a future item: `platform.self-edit` proposes and applies
edits under an allowlist (`src/`, `web/src/`, `docs/`, `scripts/`, a few root docs), and is
approval-gated with no exception - see `ApprovalService`'s `self-edit` policy in
`src/orchestration/approval/approval.service.ts`. The backend also has broad system access now
(`system.fs-write`, `system.fs-delete`, `system.run-shell`, etc., all in
`src/domain/modules/system/system.module.ts`) - every one of those, and `platform.self-edit`,
routes writes/deletes through `assertPathAllowed()` in `protected-paths.ts`, which is exactly
what stands between "Jarvis can edit its own code" and "Jarvis can edit this folder or the
approval gate out of existence." That guard is covered by its own test
(`protected-paths.test.ts`) and is itself one of the files Layer 2 hashes.

**The one honest limit:** nothing in Layers 1–3 can stop a command running with
*elevated/admin* privileges — no userland mechanism can. `system.run-shell` runs at the
backend's own (non-elevated) privilege level, so it inherits this same limit rather than
escaping it — a command that tries to elevate still hits a real Windows UAC prompt. If Jarvis
is ever given a way to run already-elevated commands, treat that as a separate, much bigger
decision, not something this system quietly covers. The real last resort, always, is Task
Manager → End Task.

## Setup (in order — this order matters)

```bash
cd desktop
npm install
npm run build          # compiles main.ts / killSwitch.ts / integrityWatchdog.ts to dist/
npm run start           # first launch: no manifest yet, so it records one from what you just built
```

Confirm the dashboard window opens and the kill switch works (hotkey
`Ctrl+Shift+Alt+Escape`, or the tray's "⛔ Emergency Stop") *before* locking anything down.

Then, from an **elevated** PowerShell prompt:

```powershell
powershell -ExecutionPolicy Bypass -File desktop\scripts\lockdown.ps1
```

From this point on, `desktop/` — including the integrity manifest itself — is read-only to
your normal user account. A shell command Jarvis runs under that same account cannot modify
or delete any of it.

## If you need to change anything in `desktop/` yourself later

```powershell
powershell -ExecutionPolicy Bypass -File desktop\scripts\unlock.ps1   # elevated
# ... make your edits ...
npm run build
npm run reseal          # re-records the trust baseline from your new files
powershell -ExecutionPolicy Bypass -File desktop\scripts\lockdown.ps1   # elevated, lock it again
```

Skipping `reseal` after a legitimate change will make the watchdog treat your own edit as
tampering and kill the app on next launch — that's the system working as intended, just
pointed at the wrong target if you forget this step.

## Moving this to another machine

Nothing here is hardcoded to this machine — `main.ts` resolves the backend and dashboard
paths relative to the repo root at runtime. Copy the whole `Jarvis-V1/` folder (including
`desktop/`) to the other system, then repeat the Setup steps above there — the integrity
manifest is machine-specific on purpose (it's in `.gitignore`) and must be baselined fresh
on each machine you run this on, from a build you trust on that machine.
