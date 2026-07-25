# CommandOS

Deterministic command / workflow / rule platform. Specs are frozen at tag `docs-v1.0`.

## Architecture (5 layers)

```text
src/
  control/          # API, auth, command engine
  orchestration/    # workflows, queue
  evaluation/       # rules, validators
  domain/           # modules + skills
  infrastructure/   # db, cache, AI, shared services
```

Dependency flow is downward-only. See `docs/04-Folder-Structure.md`.

## Sprint 0–2 (current)

- Config (Zod + env)
- Logging (Pino)
- MongoDB (collections + indexes)
- Redis cache client (optional at boot)
- JWT auth middleware + dev token endpoint
- Health API
- Command Engine (`POST /api/command`)
- Rule Engine evaluator
- In-memory System Event Bus
- Workflow Engine + Runtime (`POST /api/workflows`)
- Queue service (BullMQ when Redis is up; inline fallback otherwise)
- Scheduler service (node-cron)
- Docker Compose (API + Mongo + Redis)

## Quick start

```bash
cp .env.example .env
docker compose up mongo-db -d
npm install
npm run migrate
npm run dev
```

Health check:

```bash
curl http://localhost:8080/api/health
```

Dev JWT (development only):

```bash
curl -X POST http://localhost:8080/api/auth/dev-token -H "content-type: application/json" -d "{\"userId\":\"local-user\"}"
```

Docker (full stack):

```bash
docker compose up --build
```

## Implementation order

| Sprint | Focus |
| --- | --- |
| 0 | Monorepo foundation (this) |
| 1 | Command Engine, Rule Engine, Event Bus |
| 2 | Workflow Engine, Runtime, Queue, Scheduler |
| 3 | Browser / Search / GitHub / Storage services |
| 4 | Career module (first end-to-end workflow) |

Do not change architecture docs unless implementation exposes a real problem. Treat `docs/` as contracts.

## Database note

Runtime uses **MongoDB** (`mongodb` driver). See `docs/26-ADR/ADR-004-MongoDB.md`.
