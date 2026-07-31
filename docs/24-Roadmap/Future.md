# Roadmap status (honest)

## Complete

All planned product phases are done. There is **no remaining engineering backlog**.

* MVP / Phase 2 / Phase 3 / Future scaffolding — **done**
* Production hardening (AI tiers, Playwright, SMTP, plugins, decisions, RBAC, connectors) — **done**
* OCR, git clone, DuckDuckGo search, React dashboard, voice assistant — **done**
* LLM-backed career/cover/interview, PR review, competitor analysis — **done**
* PDF parsing, PromptLibrary / Safety / Evaluation, API key auth — **done**
* Workflow pause/resume on approval gates — **done**
* Ollama first-class mode (`AI_MODE=ollama` default) — **done**

## Operator-only step (not code)

Personal use (your PC + MongoDB Compass):

1. Keep Mongo running on `127.0.0.1:27017` (no Docker required)
2. `npm install && npm run migrate && npm run dev`
3. Optional for better AI drafts: install [Ollama](https://ollama.com) → `ollama pull llama3.2`

Until Ollama is up, drafts use the deterministic offline composer automatically.  
**Do not add cloud AI keys** for personal use — leave Anthropic/Gemini empty.

See [PERSONAL_SETUP.md](../../PERSONAL_SETUP.md).

## Optional extras (not required — ignore for personal use)

* SMTP (real email sending)
* GitHub / Slack tokens
* Playwright Chromium (only if fetch browser is not enough)
* Redis (only for async queue/cache at scale)
* Cloud AI keys only if you deliberately switch to `AI_MODE=hybrid`

## Intentionally out of scope

* Drag-and-drop rule canvas (JSON editor is the product surface)
* Full desktop OS shell (widgets are embeddable status panels)
* Plugin OS-level sandbox VM
