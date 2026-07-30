# Jarvis-V1 (CommandOS)

Deterministic command / workflow / rule platform. Specs frozen at `docs-v1.0`.

## Architecture

```text
src/
  control/          # API, auth, command engine
  orchestration/    # workflows, queue, approval
  evaluation/       # rules, validators
  domain/           # career, development, startup, learning, finance
  infrastructure/   # db, cache, AI, shared services
public/dashboard/   # Phase 3 local UI
```

## Completed roadmap

| Phase | Status |
| --- | --- |
| MVP / Sprint 0–1 | Done |
| Sprint 2 workflows/queue/scheduler | Done |
| Sprint 3 shared services | Done |
| Sprint 4 Career E2E | Done |
| Phase 2 Dev+Startup, parallel steps, async queue, approvals | Done |
| Phase 3 Learning+Finance, ModelRouter, dashboard + rule editor | Done |

## Quick start

```bash
cp .env.example .env
docker compose up mongo-db -d
npm install
npm run migrate
npm run dev
```

- API health: http://localhost:8080/api/health
- Dashboard: http://localhost:8080/dashboard/

## Key APIs

- `POST /api/command`
- `POST /api/workflows` (`async: true` enqueues when Redis is up)
- `GET/POST /api/rules`
- `GET /api/approvals` + `POST /api/approvals/:id/resolve`
- `GET /api/dashboard/summary`

## Modules

Career, Development, Startup, Learning, Finance, System (`system.ping`, `system.demo`, `system.parallel-demo`).

## Database

MongoDB — see `docs/26-ADR/ADR-004-MongoDB.md`.
