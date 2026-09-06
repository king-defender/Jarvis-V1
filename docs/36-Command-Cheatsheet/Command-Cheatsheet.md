# Command Cheatsheet — System Access & Self-Improvement

Practical, copy-pasteable reference for the capabilities added in the desktop-shell work
(kill switch, `system.*` broad access, `platform.self-edit`). For the full 65-command list
across all domains, see the "Command Reference" table in the root `README.md`.

---

## 1. Starting Jarvis

**Desktop app (recommended — this is where the kill switch lives):**
```bash
cd desktop
npm install
npm run start
```
Opens the dashboard in an Electron window and spawns the backend as a child process.

**Backend only, dev mode (for API/curl testing, no kill switch):**
```bash
npm run dev
```
Listens on `http://localhost:8080`.

---

## 2. Kill switch

Only works when running through the **desktop app**, not `npm run dev` alone.

| Trigger | How |
|---|---|
| Hotkey | `Ctrl+Shift+Alt+Escape` — works globally, no window focus needed |
| Tray | Right-click the tray icon → "⛔ Emergency Stop" |
| Automatic | Integrity watchdog fires it on its own if `desktop/*.js` or the two protected backend files are hashed and found changed |

Either one SIGKILLs the backend process directly (not via its API) and quits Electron. Last
resort if all of that somehow fails: Task Manager → End Task on `electron.exe` / `node.exe`.

---

## 3. Auth

Every command goes through `POST /api/command`, which requires a bearer token.

**Dev token (local machine only — no password, don't expose this route outside localhost):**
```bash
curl -s -X POST http://localhost:8080/api/auth/dev-token \
  -H "Content-Type: application/json" \
  -d '{"role":"owner"}'
```
Returns `{ "token": "..." }`. Save it:
```bash
TOKEN="<paste token here>"
```
`role` can be `owner`, `admin`, `member`, or `viewer` — only `owner`/`admin` can resolve
approvals (`canApprove` in `rbac.ts`).

---

## 4. The submit → approve → execute cycle

Every command below is under `system.*` or is `platform.self-edit` — both are **always**
approval-gated. Submitting one never runs it immediately.

**Step 1 — submit:**
```bash
curl -s -X POST http://localhost:8080/api/command \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"command":"system.fs-read","payload":{"path":"package.json"}}'
```
Returns `202` with `{ "status": "PENDING_REVIEW", "approval": { "id": "<approvalId>", ... } }`.

**Step 2 — see what's waiting:**
```bash
curl -s http://localhost:8080/api/approvals -H "Authorization: Bearer $TOKEN"
```
(Also visible in the dashboard's Approvals panel.)

**Step 3 — approve or reject:**
```bash
curl -s -X POST http://localhost:8080/api/approvals/<approvalId>/resolve \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"APPROVED"}'
```
Use `{"decision":"REJECTED","reason":"..."}` to decline. Approving runs the command and
returns the real result in `execution.result`.

---

## 5. Commands, with example payloads

### File access (`system.fs-*`) — operates anywhere on disk, no sandbox

```json
// system.fs-read — reads a file, or lists a directory
{"path": "C:\\Users\\you\\Documents\\notes.txt", "encoding": "utf8"}

// system.fs-write — creates parent dirs automatically
{"path": "C:\\Users\\you\\Documents\\out.txt", "content": "hello", "encoding": "utf8"}

// system.fs-delete
{"path": "C:\\Users\\you\\Documents\\out.txt", "recursive": false}
```
`encoding` is `"utf8"` or `"base64"` (use base64 for binary files).
Writes/deletes refuse `desktop/`, `.git/`, `node_modules/`, and the approval/protected-paths
guard files — that refusal happens even after you approve it; the approval just means a human
signed off on *attempting* it.

### App control

```json
// system.launch-app
{"command": "notepad.exe", "args": []}

// system.close-app — by pid or by name, not both required
{"pid": 12345}
{"processName": "notepad.exe"}

// system.list-processes — filter is optional, case-insensitive substring
{"filter": "chrome"}
```
`close-app` refuses to target the Jarvis backend's own process.

### Shell execution

```json
// system.run-shell
{"command": "dir C:\\Users\\you\\Downloads", "timeoutMs": 30000}
```
`timeoutMs` defaults to 60s, max 300s. On timeout the whole process tree is killed (not just
the top-level shell). Rejected up front if the command text references a protected path.

### Input automation (Windows only)

```json
// system.automate-input — actions run in the order given
{
  "actions": [
    {"type": "move", "x": 500, "y": 400},
    {"type": "click", "button": "left"},
    {"type": "wait", "ms": 300},
    {"type": "type", "text": "Hello from Jarvis"},
    {"type": "key", "keys": "^{ESC}"}
  ]
}
```
`button` is `left` | `right` | `double`. `keys` uses raw
[SendKeys syntax](https://learn.microsoft.com/dotnet/api/system.windows.forms.sendkeys) —
e.g. `^{ESC}` is Ctrl+Escape, `%{F4}` is Alt+F4. Max 50 actions per call — batch a task into
one approval rather than approving every keystroke.

### Self-improvement

```json
// platform.self-edit — propose only (apply:false), or propose-and-apply (apply:true, default)
{"instruction": "Add a short note to docs/self-notes.md about today's setup", "apply": true}

// apply a previously-proposed change by id (still requires its own approval)
{"proposalId": "<id-from-a-prior-response>"}
```
Only allowed to touch `src/`, `web/src/`, `docs/`, `scripts/`, and a few root files — never
`desktop/`, `.git/`, `node_modules/`, `.env`, or the approval/protected-paths guard files.
Applied changes are committed to git (`simple-git`), so `git revert` undoes one if needed.

---

## 6. If something goes wrong

- Command not executing after approval → check the backend's terminal output for the error;
  a failed execution releases the approval back to `PENDING_REVIEW` so you can inspect and
  retry.
- `system.fs-write`/`run-shell`/`self-edit` all refusing a path you expected to work →
  it's very likely legitimately protected; see `src/infrastructure/security/protected-paths.ts`.
- Something behaving unexpectedly and you want it stopped *now* → kill switch (§2), not
  Ctrl+C on the terminal — Ctrl+C only stops the process you're looking at, the kill switch
  stops everything including anything it may have spawned.
