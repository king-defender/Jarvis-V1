# FROZEN RELEASE — Jarvis-V1 / CommandOS

**Tag:** `v1.0.0`  
**Intent:** Personal local system. No further project changes planned.

This build is meant to sit untouched for months and still boot on your PC.

## What this release is

- Deterministic command / workflow / rule OS
- Local MongoDB (Compass) — **no Docker required**
- AI via **Ollama** or offline composer — **no cloud API keys**
- Dashboard + voice + approvals + RBAC hardened against back-button loops

## Do not require

Docker · Redis · SMTP · GitHub · Slack · Playwright Chromium · Anthropic/Gemini keys

## When you return (months later)

1. Start MongoDB (you already use Compass)
2. Double-click `start.bat` **or** run `.\start.ps1`
3. Open http://localhost:8080/dashboard/ → **Connect**
4. Optional: install Ollama + `ollama pull llama3.2`
5. Optional proof: in a second terminal, `npm run smoke`

Also see `PERSONAL_SETUP.md`.

## Prove it still works

```bash
npm run doctor    # no server needed
.\start.ps1       # boots API
npm run smoke     # against running API
```

## Policy

Treat `v1.0.0` as the sealed personal edition. Prefer config/env changes over code edits.
