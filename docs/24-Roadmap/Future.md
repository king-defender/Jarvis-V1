# Roadmap status (honest)

## Completed phases
* MVP / Phase 2 / Phase 3 / Future scaffolding — **done**
* Production hardening (AI tiers, Playwright, SMTP, plugins, decisions, RBAC, connectors) — **done**
* OCR, git clone, DuckDuckGo search, React dashboard — **done**
* LLM-backed career/cover/interview, PR review, competitor analysis — **done**
* PDF file parsing (`platform.parse-pdf`), PromptLibrary / Safety / Evaluation — **done**
* API key auth (`x-api-key` + `API_KEY_HASH`), email alerts via EmailService — **done**
* Multi-page React dashboard navigation — **done**

## Offline-first (default)
* `AI_MODE=offline` (default) — **no API keys required**
* ModelRouter uses a deterministic composer for drafts (resume, cover letter, interview, PR review, etc.)
* `AI_MODE=ollama` — local Ollama (`OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434`, model `AI_LOCAL_MODEL`)
* `AI_MODE=hybrid` — Ollama (if configured) → Anthropic/Gemini keys → offline composer

## Still optional integrations
* SMTP, GitHub/Slack tokens, Playwright Chromium, LinkedIn cookies
* Cloud AI keys only needed for `hybrid` without Ollama
* Rule editor remains structured JSON (not a drag-and-drop canvas)

## Intentionally lightweight
* Rule editor is structured JSON (not a drag-and-drop canvas)
* Widgets are embeddable status panels, not a full desktop OS shell
* Plugin loader registers commands; no OS-level sandbox VM
