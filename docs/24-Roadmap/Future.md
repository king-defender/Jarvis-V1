# Roadmap: Future Milestones

This document details long-term goals.

---

## 1. Scope
* Multi-user profile databases. ✅ (`users` + `user_profiles`, tenant-scoped APIs)
* Desktop integration widgets. ✅ (`/widgets/?id=...` embeddable panels)
* Multi-tenant cloud hosting options. ✅ (tenant model + APIs; deploy via Docker Compose/cloud Mongo)

## 2. Also completed with this milestone
* Communication module ✅
* Automation module ✅
* Browser module ✅

## 3. Platform surfaces (docs 12–35) completed
* Tasks library (`src/domain/tasks`) ✅
* Skills library (`src/domain/skills`) + `career.prepare-interview` ✅
* Filesystem / Email / Notification services ✅
* Decision Engine + `/api/decision/evaluate` ✅
* Recovery (retry/classify/saga helpers) ✅
* Connectors registry + `/api/connectors` ✅
* Plugin loader + sample `plugins/hello-plugin` ✅
* Observability metrics/tracing + `/api/metrics` ✅
* Rate limit + audit middleware ✅
* OpenAPI (`/openapi.json`, `/api/openapi.json`) ✅
* CI workflow (`.github/workflows/ci.yml`) ✅
* Version registry (`/api/versions/workflows`) ✅
