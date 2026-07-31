# Roadmap status (honest)

## Completed phases
* MVP / Phase 2 / Phase 3 / Future scaffolding — **done**
* Production hardening (AI tiers, Playwright, SMTP, plugins, decisions, RBAC, connectors) — **done**
* OCR, git clone, DuckDuckGo search, React dashboard — **done**
* LLM-backed career/cover/interview, PR review, competitor analysis — **done**
* PDF file parsing (`platform.parse-pdf`), PromptLibrary / Safety / Evaluation — **done**
* API key auth (`x-api-key` + `API_KEY_HASH`), email alerts via EmailService — **done**
* Multi-page React dashboard navigation — **done**

## Still environment-dependent (not code gaps)
* Live LLM output needs provider keys / Ollama
* Real PNG screenshots need Playwright Chromium
* Outbound SMTP / GitHub / Slack need credentials
* LinkedIn may hit auth walls without session cookies

## Intentionally lightweight
* Rule editor is structured JSON (not a drag-and-drop canvas)
* Widgets are embeddable status panels, not a full desktop OS shell
* Plugin loader registers commands; no OS-level sandbox VM
