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

1. Install [Ollama](https://ollama.com)
2. `ollama pull llama3.2`
3. Keep Ollama running (default `http://127.0.0.1:11434`)

Until then, drafts use the deterministic offline composer automatically.

## Optional extras (not required)

* SMTP, GitHub/Slack tokens, Playwright Chromium, LinkedIn cookies
* Cloud keys only if you switch to `AI_MODE=hybrid`

## Intentionally out of scope

* Drag-and-drop rule canvas (JSON editor is the product surface)
* Full desktop OS shell (widgets are embeddable status panels)
* Plugin OS-level sandbox VM
