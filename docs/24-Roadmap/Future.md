# Roadmap: Future Milestones

This document details long-term goals.

---

## 1. Scope
* Multi-user profile databases. ✅
* Desktop integration widgets. ✅
* Multi-tenant cloud hosting options. ✅ (tenant model + Docker Compose)

## 2. Production hardening (implemented)
* Real ModelRouter tiers (Anthropic → Gemini → Ollama → offline). ✅
* Playwright browser engine with fetch fallback. ✅
* SMTP email via nodemailer (local queue if unset). ✅
* Plugin entry loading (`plugins/*/index.cjs`). ✅
* Decision Engine action execution (dispatch / approval / notify). ✅
* GitHub + Slack connectors. ✅
* Recovery retries + DLQ on workflow failure. ✅
* RBAC roles on JWT + AES-256-GCM crypto APIs. ✅
* Expanded dashboard + OpenAPI. ✅

## 3. Still optional / environment-dependent
* Live LLM output requires `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OLLAMA_BASE_URL`
* Real PNG screenshots require Playwright Chromium (`npx playwright install chromium`)
* Outbound email requires SMTP_* env vars
* GitHub/Slack connector health requires tokens/webhooks
