# Jarvis-V1 (CommandOS)

Deterministic command / workflow / rule platform.

## Roadmap status

| Phase | Status |
| --- | --- |
| MVP / Sprint 0–4 | Done |
| Phase 2–3 | Done |
| Future (multi-user, multi-tenant, widgets) | Done |
| Remaining domain modules (Communication, Automation, Browser) | Done |

## Quick start

```bash
cp .env.example .env
docker compose up mongo-db -d
npm install
npm run migrate
npm run dev
```

- Dashboard: http://localhost:8080/dashboard/
- Widgets: http://localhost:8080/widgets/?id=status

## Modules

System, Career, Development, Startup, Learning, Finance, Communication, Automation, Browser.

## Multi-tenant / multi-user

- `GET/POST /api/tenants`
- `GET/POST /api/tenants/:tenantId/users`
- Default tenant `default` seeded on boot

## Desktop widgets

Embeddable panels under `/widgets/?id=status|commands|approvals|workflows`.
