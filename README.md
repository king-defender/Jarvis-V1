# Jarvis-V1 (CommandOS)

Deterministic **command / workflow / rule** platform with optional local LLM via **Ollama**, a React control dashboard, and a voice/text assistant.

Commands and workflows drive control flow. AI is used for drafting and analysis only — it never owns authorization or execution decisions.

| | |
| --- | --- |
| **Package** | `command-os` `0.1.0` |
| **Runtime** | Node.js ≥ 20 |
| **Default API** | `http://localhost:8080` |
| **Dashboard** | `http://localhost:8080/dashboard/` |
| **Repo** | https://github.com/king-defender/Jarvis-V1 |

---

## Table of contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Quick start](#quick-start)
4. [Configuration](#configuration)
5. [AI / Ollama](#ai--ollama)
6. [Authentication & RBAC](#authentication--rbac)
7. [How to use](#how-to-use)
8. [Modules & commands](#modules--commands)
9. [Workflows](#workflows)
10. [HTTP API](#http-api)
11. [Dashboard](#dashboard)
12. [Approvals](#approvals)
13. [Code layout](#code-layout)
14. [Scripts](#scripts)
15. [Docker](#docker)
16. [Limitations](#limitations)
17. [Troubleshooting](#troubleshooting)

---

## What it does

CommandOS lets you:

- **Execute typed commands** (Zod-validated) through a central router
- **Run multi-step workflows** with payload mapping, retries, parallel batches, cancel, and pause
- **Evaluate rules & decisions** (AND/OR condition groups → dispatch, approve, notify, or skip)
- **Gate risky actions** behind human approvals (`finance.*`, outbound email/alerts)
- **Draft with AI** via Ollama (default), cloud providers (optional), or a built-in offline composer
- **Control the system** from a React dashboard (commands, workflows, rules, decisions, approvals, voice, platform)
- **Speak or type intents** through an offline intent resolver (`assistant.interpret` / Voice page)
- **Integrate** MongoDB, optional Redis/BullMQ, SMTP, GitHub, Slack webhooks, Playwright/fetch browser, OCR, PDF, git clone

**Design rule (ADR-005):** LLMs do not decide control flow. Commands, workflows, rules, and approvals do.

---

## Architecture

```
src/
  control/          HTTP API, auth, command router
  orchestration/    workflows, approvals, queue, recovery
  evaluation/       rule engine, decision engine
  domain/           modules, skills, tasks
  infrastructure/   Mongo, Redis, AI, browser, email, plugins, security
  shared/           types, version registry
web/                React dashboard (Vite → public/dashboard/)
```

**Layers**

| Layer | Responsibility |
| --- | --- |
| Control | Auth, REST, command registration & routing |
| Orchestration | Workflow runtime/coordinator, approval claims, retries/DLQ |
| Evaluation | Rule groups, decision policies |
| Domain | Feature modules (career, finance, …) |
| Infrastructure | DB, cache, AI ModelRouter, filesystem sandbox, connectors |

**Persistence:** MongoDB (required).  
**Cache/queue:** Redis + BullMQ (optional — sync/inline fallback if Redis is down).

---

## Quick start (personal PC — no Docker)

You already use **MongoDB Compass**. Point the app at that Mongo; do **not** require Docker.

```bash
cp .env.example .env          # already Ollama-ready, BROWSER_ENGINE=fetch
npm install
npm run migrate
npm run dev
```

- Dashboard: http://localhost:8080/dashboard/
- See **[PERSONAL_SETUP.md](./PERSONAL_SETUP.md)** if you return after months — required vs ignore list.

### Optional local LLM

```bash
ollama pull llama3.2
```

No Anthropic/Gemini keys needed for personal use.

### Production-style build

```bash
npm run build
npm start
```

---

## Configuration

Copy `.env.example` → `.env`. Important variables:

### App

| Variable | Default | Notes |
| --- | --- | --- |
| `APP_ENV` | `development` | Enables `POST /api/auth/dev-token` when `development` |
| `PORT` | `8080` | API + static dashboard |
| `BASE_DATA_PATH` | `./data` | Sandboxed FS root for reads/writes/OCR/clone |

### Auth

| Variable | Notes |
| --- | --- |
| `JWT_SECRET` | JWT signing secret |
| `ENCRYPTION_KEY` | AES helper for `/crypto/*` |
| `API_KEY_HASH` | Optional SHA-256 hex of an API key (`x-api-key`) |

Generate API key hash:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('my-key').digest('hex'))"
```

### Data stores

| Variable | Default | Required |
| --- | --- | --- |
| `MONGO_URL` | `mongodb://127.0.0.1:27017` | **Yes** |
| `MONGO_DB_NAME` | `command_os` | Yes |
| `REDIS_URL` | `redis://localhost:6379` | No |

### AI

| Variable | Default | Notes |
| --- | --- | --- |
| `AI_MODE` | `ollama` | `offline` \| `ollama` \| `hybrid` |
| `AI_LOCAL_MODEL` | `llama3.2` | Ollama model name |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ignored in `offline` |
| `OLLAMA_TIMEOUT_MS` | `120000` | Chat timeout |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | — | Used only in `hybrid` |
| `AI_MONTHLY_LIMIT_USD` | `50` | Soft spend guard for cloud tiers |

### Optional integrations

| Variable | Purpose |
| --- | --- |
| `SMTP_*` | Real email via nodemailer; otherwise local queue |
| `GITHUB_TOKEN` | GitHub API / connector |
| `SLACK_WEBHOOK_URL` | Slack notifications |
| `BROWSER_ENGINE` | `auto` \| `playwright` \| `fetch` |
| `SEARCH_API_URL` | Override job/search backend |

---

## AI / Ollama

| Mode | Behavior |
| --- | --- |
| `ollama` (default) | Call local Ollama `/api/chat` → offline composer on failure |
| `offline` | Deterministic template composer only (no network) |
| `hybrid` | Ollama (if URL set) → Anthropic → Gemini → offline |

**Surfaces**

- Commands: `platform.ai-status`, `platform.ai-complete`
- HTTP: `GET /api/ai/status`, `POST /api/ai/complete`
- Dashboard → **Platform** shows mode + Ollama reachability/models
- Voice: say “ai status” / “ollama”

Skills that draft text (resume, cover letter, PR review, competitor notes, etc.) all go through `ModelRouterService`.

---

## Authentication & RBAC

### Mechanisms

1. **JWT** — `Authorization: Bearer <token>`
2. **API key** — `x-api-key: <secret>` (must match `API_KEY_HASH`); role `admin`
3. **Dev token** — `POST /api/auth/dev-token` when `APP_ENV=development`

### Roles

| Role | Can |
| --- | --- |
| `owner` / `admin` | Full mutate + approve |
| `member` | Execute most commands / start workflows |
| `viewer` | Read + `system.ping`, `assistant.*`, `platform.ai-status` |

Mutating surfaces (rules, tenants, workflow resume/cancel, decision execute, assistant auto-execute) require mutate-capable roles. Approvals require `admin` or `owner`.

### Browser auth navigation (back-button / loops)

The dashboard hardens against common SPA auth bugs:

| Bug | Mitigation |
| --- | --- |
| Back button returns a signed-in user to Login | Auth gate never renders Login while a session exists; `history.replaceState` marks `app` vs `login` |
| bfcache restores a stale login/app shell | `pageshow` (persisted) re-syncs from live `sessionStorage`; dashboard HTML is `Cache-Control: no-store` |
| Logout ↔ home redirect loop | Single-flight `clearSession()`; API clears session only on **401** (not 403); logout clears token **before** switching view |
| Stale token after expiry | Bootstrap validates `/dashboard/summary`; failed auth forces login once |

Source: `web/src/auth/session.ts`, `web/src/auth/navigation-guard.ts`.

For React Router apps, apply the same rules: authenticated routes redirect **away** from `/login` with `replace: true`; guest routes redirect to `/login` with `replace: true`; never `navigate('/home')` after a logout that already cleared the token without a single authority for “am I logged in?”.

---

## How to use

### 1. Get a token (dev)

```bash
curl -s -X POST http://localhost:8080/api/auth/dev-token | jq
# → { "token": "..." }
```

### 2. List & run a command

```bash
TOKEN=...

curl -s http://localhost:8080/api/commands \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST http://localhost:8080/api/command \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command":"system.ping","payload":{"message":"hello"}}' | jq
```

### 3. Start a workflow

```bash
curl -s -X POST http://localhost:8080/api/workflows \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"system.demo","payload":{"message":"hi","followUp":"there"}}' | jq
```

### 4. Voice / assistant

```bash
curl -s -X POST http://localhost:8080/api/assistant/interpret \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"utterance":"search remote typescript jobs","autoExecute":true}' | jq
```

Or use Dashboard → **Voice** (type, Listen via Web Speech, TTS reply).

### 5. AI complete (Ollama)

```bash
curl -s -X POST http://localhost:8080/api/ai/complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Write three bullet points about TypeScript","systemPrompt":"Be concise"}' | jq
```

### 6. Approvals

Risky commands return `PENDING_REVIEW`. List and approve:

```bash
curl -s http://localhost:8080/api/approvals -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST http://localhost:8080/api/approvals/<id>/resolve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"decision":"APPROVED"}' | jq
```

If the approval came from a **paused workflow**, approving executes the step and **resumes** the workflow; rejecting fails the workflow.

---

## Modules & commands

Eleven domain modules register **47** commands.

### System
| Command | Purpose |
| --- | --- |
| `system.ping` | Health-style ping |

### Assistant
| Command | Purpose |
| --- | --- |
| `assistant.interpret` | Deterministic NL → intent (interpret-only via `/command`; execute via `/assistant/interpret`) |

### Career
| Command | Purpose |
| --- | --- |
| `career.sync-profile` | Sync/store profile |
| `career.search-jobs` | Search listings (filters + rules) |
| `career.optimize-resume` | Resume bullets for a job |
| `career.draft-cover-letter` | Cover letter draft |
| `career.track-application` | Track application status |
| `career.prepare-interview` | Interview Q&A prep |

### Development
| Command | Purpose |
| --- | --- |
| `development.generate-boilerplate` | Scaffold project under data sandbox |
| `development.review-pr` | PR review via GitHub + AI |
| `development.audit-repo` | Secret/pattern scan (sandboxed path) |
| `development.clone-repo` | Clone into data dir |

### Startup
| Command | Purpose |
| --- | --- |
| `startup.analyze-competitor` | Competitor notes |
| `startup.generate-pitch` | Pitch draft |
| `startup.optimize-seo` | SEO suggestions |

### Learning
| Command | Purpose |
| --- | --- |
| `learning.create-syllabus` | Syllabus plan |
| `learning.generate-flashcards` | Flashcards from text/file |
| `learning.summarize-paper` | Paper summary |

### Finance *(approval-gated)*
| Command | Purpose |
| --- | --- |
| `finance.parse-receipt` | Parse receipt text/image (OCR) |
| `finance.generate-report` | Expense report |

### Communication
| Command | Purpose |
| --- | --- |
| `communication.summarize-emails` | Thread summary |
| `communication.draft-reply` | Reply draft |
| `communication.send-alert` | Alert *(approval-gated)* |

### Automation
| Command | Purpose |
| --- | --- |
| `automation.register-trigger` | Cron/trigger registration |
| `automation.run-workflow` | Start a named workflow |

### Browser
| Command | Purpose |
| --- | --- |
| `browser.crawl-page` | Fetch/crawl page |
| `browser.screenshot` | Screenshot URL |

### Platform
| Command | Purpose |
| --- | --- |
| `platform.ai-status` / `platform.ai-complete` | AI probe & completion |
| `platform.decide` | Run decision policy |
| `platform.extract-keywords` | Keyword extraction |
| `platform.match-resume` | Resume↔job match score |
| `platform.parse-html` / `platform.extract-dom` | HTML helpers |
| `platform.parse-pdf` / `platform.parse-pdf-text` | PDF text |
| `platform.ocr` | Tesseract OCR (sandboxed path) |
| `platform.git-clone` | Git clone under `data/repos` |
| `platform.fs-read` / `platform.fs-write` | Sandboxed filesystem |
| `platform.send-email` / `platform.notify` | Email / local notify *(email approval-gated)* |
| `platform.research-company` | Company research skill |
| `platform.generate-docs` / `platform.generate-prd` | Doc/PRD drafts |
| `platform.deployment-plan` / `platform.pricing-analysis` | Planning skills |
| `platform.evaluate-output` | Output evaluation |
| `platform.classify-error` | Error classification |
| `platform.connector-test` | Connector health |

Plugins under `plugins/` can register additional commands at boot.

---

## Workflows

| Name | What it does |
| --- | --- |
| `system.demo` | Two `system.ping` steps (optional context mappings) |
| `system.parallel-demo` | Demonstrates parallel step groups |
| `career.job-application` | Search → optimize resume → cover letter → track |

**Runtime features**

- JSONPath-style mappings (`$.context.x`, `$.step.listings.0.id`)
- Optional mappings with `?` suffix (omit if missing)
- Per-step retries + dead-letter queue
- Parallel batches via `parallelGroup`
- Cancel → status `CANCELLED`
- Approval-required steps → workflow **PAUSED** → approve → execute + **resume**

Start:

```http
POST /api/workflows
{ "name": "career.job-application", "payload": { "keywords": ["TypeScript"], "location": "Remote", "resumeId": "primary-resume-1" }, "async": false }
```

With Redis enabled and `"async": true`, accepted work returns **202** only when actually queued as `PENDING`.

---

## HTTP API

Base path: `/api` (also static `/dashboard`, `/widgets`, `/openapi.json`).

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/health` | no | DB / cache / Ollama checks |
| GET | `/ai/status` | yes | Provider status |
| POST | `/ai/complete` | yes (mutate) | ModelRouter complete |
| GET | `/openapi.json` | no | Spec |
| GET | `/metrics` | yes | Metrics + recent traces |
| GET | `/plugins` | yes | Loaded plugins |
| GET | `/connectors` | yes | Connector list |
| POST | `/connectors/:id/test` | yes | Test connector |
| POST | `/decision/evaluate` | yes | Decision engine |
| GET | `/versions/workflows` | yes | Workflow version registry |
| POST | `/assistant/interpret` | yes | Voice/text intent (+ optional execute) |
| POST | `/auth/dev-token` | no* | Dev only |
| POST | `/crypto/encrypt` | yes | Encrypt string |
| POST | `/crypto/decrypt` | yes | Decrypt string |
| GET | `/commands` | yes | List commands |
| POST | `/command` | yes | Execute command (approval intercept) |
| GET | `/workflows` | yes | List definitions |
| POST | `/workflows` | yes (mutate) | Start workflow |
| GET | `/workflows/:id` | yes | Get instance |
| POST | `/workflows/:id/resume` | yes (mutate) | Resume paused |
| POST | `/workflows/:id/cancel` | yes (mutate) | Cancel |
| GET | `/approvals` | yes | Pending approvals |
| POST | `/approvals/:id/resolve` | yes (approve) | Approve/reject |
| GET/POST | `/rules` | yes / mutate | Rule CRUD |
| GET | `/dashboard/summary` | yes | Dashboard bootstrap |
| GET/POST | `/tenants` | yes / mutate | Tenants |
| GET/POST | `/tenants/:tenantId/users` | yes / mutate | Users |
| GET | `/widgets` | yes | Widget catalog |
| GET | `/widgets/:id/data` | yes | Widget payload |

\* `POST /auth/dev-token` only when `APP_ENV=development`.

---

## Dashboard

Served from `public/dashboard/` (built from `web/` via `npm run build:web`).

| Page | Use |
| --- | --- |
| **Commands** | Pick command, edit JSON payload, execute |
| **Workflows** | List & start workflows |
| **Rules** | Save structured JSON rule groups |
| **Decisions** | Paste policy + data, evaluate |
| **Approvals** | Approve pending items |
| **Voice** | Type / Listen / TTS via assistant API |
| **Platform** | Plugins, connectors, AI/Ollama status, metrics |

Click **Connect** to mint a dev token and load `/dashboard/summary`.

Embeddable widgets: `/widgets/?id=status|commands|approvals|workflows`.

---

## Approvals

Default policies gate:

- `finance.*`
- `communication.send-alert`
- `platform.send-email`

Flow:

1. Request → status `PENDING_REVIEW`
2. Approver **claims** atomically (`APPROVING`) to prevent double-execute
3. Command runs as the **requester**
4. Marked `APPROVED`, or claim released on failure
5. If payload includes `__resumeWorkflowId` / `__resumeStepName`, workflow resumes after success

---

## Code layout

```
src/
  app.ts                 Boot: wire services, register modules, listen
  config.ts              Zod env → SystemConfig
  control/
    api/router.ts        REST routes
    auth/                JWT / API key middleware
    command-engine/      CommandRouter
  domain/
    modules/             Feature command packs
    skills/              Higher-level LLM skills
    tasks/               OCR, PDF, git, DOM helpers
  evaluation/
    rules/               RuleEngineEvaluator
    decision/            DecisionEngine
  infrastructure/
    ai/                  ModelRouter, prompts/safety/eval
    database/            Mongo connection + migrate indexes
    cache/               Redis (optional)
    services/            FS sandbox, email, browser, search, github, …
    security/            RBAC, encryption
    plugins/             Plugin loader
    connectors/          HTTP / GitHub / Slack-style connectors
  orchestration/
    workflow/            Runtime, coordinator, pause/resume
    approval/            ApprovalService
    queue/               BullMQ wrapper
    recovery/            Retry / error class helpers
web/                     React + Vite source
public/dashboard/        Built UI
plugins/                 Optional plugin packages
docs/                    Architecture & ADR docs (frozen docs-v1.0 + updates)
```

**Key types:** `SystemCommandDirective`, `CommandRegistration`, `WorkflowDefinition`, `DecisionPolicy`.

**Path safety:** user-supplied paths resolve under `BASE_DATA_PATH` via `resolveSandboxedPath` / `FilesystemService`.

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | API with hot reload (`tsx watch`) |
| `npm run dev:web` | Vite dashboard (proxies `/api` → 8080) |
| `npm run build` | Compile TS + build dashboard |
| `npm start` | Run compiled server |
| `npm run migrate` | Ensure DB indexes/collections |
| `npm run backup` | Backup helper |
| `npm test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` |

---

## Docker

`docker-compose.yml` services:

| Service | Role | Port |
| --- | --- | --- |
| `mongo-db` | MongoDB 7 | `27017` |
| `redis-cache` | Redis 7 | `6379` |
| `command-os-api` | App image | `8080` |

Typical local deps only:

```bash
docker compose up mongo-db -d
# optional:
docker compose up redis-cache -d
```

---

## Limitations

### Intentionally out of scope

- No drag-and-drop rule canvas (structured JSON editor only)
- Widgets are embeddable panels, not a full desktop OS
- Plugins register commands; there is no OS-level sandbox VM for plugin code
- Voice intent mapping is **deterministic regex**, not an LLM NLU stack
- Career job search uses configured/search backends + heuristics — not a guaranteed live LinkedIn scrape without cookies/credentials

### Operational / optional

| Need | If missing |
| --- | --- |
| MongoDB | App will not start |
| Redis | App runs; async queue/cache degraded |
| Ollama | AI drafts use offline composer |
| SMTP | Email queued/logged locally |
| Playwright Chromium | Browser falls back toward `fetch` / `BROWSER_ENGINE` |
| GitHub/Slack tokens | Related connectors/commands degrade gracefully |

### Security notes

- Change `JWT_SECRET` / `ENCRYPTION_KEY` before any shared deployment
- Dev token endpoint must stay disabled outside `development`
- Viewers cannot mutate platform state
- File and git operations are sandboxed under `BASE_DATA_PATH` — do not point that at sensitive system roots

### Product honesty

- Offline composer produces structured drafts, not frontier-model quality
- Empty job searches return `jobsFound: 0` (workflows then fail closed on missing `jobId`)
- Approval policies are pattern-based and intentionally narrow; expand carefully

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Health `database: down` | Start Mongo; check `MONGO_URL` |
| Health `ollama: down` | Start Ollama; `ollama pull llama3.2`; check `OLLAMA_BASE_URL` |
| `202` expected but got `201` on workflows | Redis/queue disabled — sync run is correct |
| Command stuck pending | Open Approvals (needs admin/owner) |
| `Path escapes sandbox` | Use paths relative to `BASE_DATA_PATH` |
| Dashboard empty after Connect | Ensure API is on `:8080` and `APP_ENV=development` |
| Type errors after pull | `npm install` && `npm run typecheck` |

Check AI status:

```bash
curl -s http://localhost:8080/api/health | jq
curl -s http://localhost:8080/api/ai/status -H "Authorization: Bearer $TOKEN" | jq
```

---

## License / branding

Product branding in the UI: **Jarvis-V1**.  
Internal platform name: **CommandOS** (`command-os`).

Docs under `docs/` describe architecture decisions; implementation may supersede frozen tags such as `docs-v1.0` where ADRs note Mongo instead of SQLite, etc.
