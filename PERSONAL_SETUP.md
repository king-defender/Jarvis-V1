# Personal local setup (no Docker, no cloud AI keys)

Use this when you return in a few months. Jarvis-V1 is built to run on **your PC** with MongoDB you already have (Compass) and optional **Ollama**. Docker is **not required**.

## Checked on this machine (Aug 2026 snapshot)

| Check | Status |
| --- | --- |
| Node.js | Installed (`v24`) |
| MongoDB on `127.0.0.1:27017` | **Up** (Compass-compatible) |
| Redis | Not running — **OK, not required** |
| Ollama | Not running — install when you want local LLM drafts |
| Docker | Present on PATH — **do not need it** for this setup |
| Cloud AI keys | **Not used** (personal project) |

## What you need vs what you can ignore

### Required
1. **Node 20+** — already installed  
2. **MongoDB** — already running locally; DB name in `.env`: `command_os`  
3. Start the app:
   ```bash
   cd c:\Users\hp\Downloads\sgdfs
   npm install
   npm run migrate
   npm run dev
   ```
4. Open http://localhost:8080/dashboard/ → **Connect**

### Strongly recommended (for AI drafts)
5. Install [Ollama](https://ollama.com)  
6. `ollama pull llama3.2`  
7. Leave Ollama running  

Until Ollama is up, the app still works; drafts use the built-in offline composer (no keys).

### Not required for personal use (leave blank in `.env`)
Explained below — empty values are correct.

---

## What those “optional” words mean

| Term | What it is | Do you need it? |
| --- | --- | --- |
| **SMTP** | Mail server settings so the app can send real emails (Gmail/Outlook/etc.) | **No.** Without it, alerts/emails are stored locally in Mongo. Fine for personal use. |
| **GitHub token** | Personal access token so commands can call GitHub (PR review, profile, clone APIs) | **No**, unless you want live GitHub PR review against private repos. |
| **Slack webhook** | URL so alerts post into a Slack channel | **No.** Dashboard Approvals + local notify are enough. |
| **Playwright** | Full browser engine (Chromium) for screenshots / JS-heavy pages | **No** for speed. `.env` uses `BROWSER_ENGINE=fetch` (lightweight HTTP). Use Playwright later only if screenshots break. |
| **Redis** | In-memory cache + background job queue | **No** for personal use. App runs without it (sync workflows). Add only if you want heavy async queues later. |
| **Cloud AI keys** (Anthropic / Gemini) | Paid remote LLM APIs | **No.** You chose local Ollama / offline composer. Keep `AI_MODE=ollama` and leave keys empty. |

---

## Fast personal defaults (already set)

- `AI_MODE=ollama` — local LLM, no cloud keys  
- `BROWSER_ENGINE=fetch` — faster startup, no Chromium download  
- `MONGO_URL=mongodb://127.0.0.1:27017` — your Compass Mongo  
- Redis / SMTP / GitHub / Slack — empty or unused  

## When you come back (checklist)

```text
[ ] Mongo running (Compass can connect to 127.0.0.1:27017)
[ ] Double-click start.bat  OR  run: .\start.ps1
[ ] Dashboard Connect works → http://localhost:8080/dashboard/
[ ] (optional) npm run smoke
[ ] (optional) Ollama + llama3.2 for better drafts
[ ] Ignore Docker, Redis, SMTP, Slack, GitHub, cloud keys
```

Read **FROZEN.md** — this tree is sealed as `v1.0.0`.

## Self-learning (no manual code updates required)

Jarvis improves from **use**, stored in Mongo:

| You say / do | What happens |
| --- | --- |
| `when I say morning check run system.ping` | Saves a taught intent forever |
| `remember my title is staff engineer` | Saves a memory note |
| `that was good` / `that was bad` | Stores feedback |
| `what do you remember` | Recalls notes + teachings |
| `update your code to …` | Proposes + applies a **sandboxed** file change (`SELF_CODE_EDIT=true`) |

**Code self-edit allowlist:** `src/`, `web/src/`, `docs/`, `scripts/` (+ a few root docs). Never `.env`, `node_modules`, or `.git`.

Runtime learning does **not** require redeploying. Code edits need the API process to reload (`tsx watch` via `start.ps1` does this for TypeScript).
