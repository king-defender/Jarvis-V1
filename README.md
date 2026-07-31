# Jarvis-V1 (CommandOS)

Deterministic command / workflow / rule platform with optional local LLM via Ollama.

## Status

**Complete.** No engineering backlog remains. Your only setup step for AI is installing Ollama.

| Area | Status |
| --- | --- |
| Commands, workflows, rules, approvals, RBAC | Done |
| Modules (Career, Dev, Startup, Learning, Finance, Comm, Automation, Browser) | Done |
| Voice assistant + dashboard | Done |
| Offline composer (always available) | Done |
| Ollama local LLM | Ready — install Ollama |
| Cloud AI / SMTP / GitHub / Slack | Optional extras |

## One thing left (AI)

```bash
# Install from https://ollama.com then:
ollama pull llama3.2
```

`.env` is already set to `AI_MODE=ollama` + `OLLAMA_BASE_URL=http://127.0.0.1:11434`.

If Ollama is down, the app still runs using the deterministic offline composer.

## Quick start

```bash
cp .env.example .env   # already Ollama-ready
docker compose up mongo-db -d
npm install
npm run migrate
npm run dev
```

- Dashboard: http://localhost:8080/dashboard/
- AI status: http://localhost:8080/api/ai/status (after auth)
- Widgets: http://localhost:8080/widgets/?id=status

## AI modes

| `AI_MODE` | Behavior |
| --- | --- |
| `ollama` (default) | Local Ollama → offline composer fallback |
| `offline` | Deterministic composer only (no network) |
| `hybrid` | Ollama → Anthropic/Gemini (if keys) → offline |

## Modules

System, Assistant, Career, Development, Startup, Learning, Finance, Communication, Automation, Browser, Platform.
