# System Architecture

## 1. High-Level Architectural Topology

CommandOS operates as a strictly layered, asynchronous execution runtime. The architecture enforces a downward-only dependency flow: Components at higher layers may invoke components at lower layers, but lower layers have zero structural awareness of the layers above them.

```
       [ Client Interface ] (UI Dashboard, CLI, API, Webhooks)
               │
               ▼
┌────────────────────────────────────────────────────────┐
│ 1. CONTROL LAYER (API Gateway, Auth, Command Engine)  │
└──────────────────────────────┬─────────────────────────┘
                               │ Validated Command Payload
                               ▼
┌────────────────────────────────────────────────────────┐
│ 2. ORCHESTRATION LAYER (Workflow Engine)               │
└──────────────────────────────┬─────────────────────────┘
                               │ State / Context Mapping
                               ▼
┌────────────────────────────────────────────────────────┐
│ 3. EVALUATION LAYER (Rule Engine)                      │
└──────────────────────────────┬─────────────────────────┘
                               │ Filtered / Condition-Passed Ingestion
                               ▼
┌────────────────────────────────────────────────────────┐
│ 4. DOMAIN LAYER (Modules & Pluggable Skills)           │
└──────────────────────────────┬─────────────────────────┘
                               │ Atomic Executable Directives
                               ▼
┌────────────────────────────────────────────────────────┐
│ 5. INFRASTRUCTURE LAYER (Shared Services, Tools, AI)    │
└────────────────────────────────────────────────────────┘
```

## 2. Subsystem Boundaries & Communication Contracts

Communication across system layers relies on a strongly typed, event-driven pattern managed by an internal Node.js system bus.

* **Asynchronous Tasks:** Long-running tasks (e.g., Playwright web scraping jobs) are pushed to an in-memory execution queue backend by a Redis-backed scheduler to prevent API Gateway timeouts.
* **Immutability:** Data payloads passed between Modules and Skills are deeply cloned frozen objects to eliminate side effects during parallel task execution.

## 3. Graceful Degradation & Network Isolation Matrix

If downstream external services encounter outages, the system behaves according to a deterministic fallback matrix:

| Component Outage | Immediate System Behavior | Fallback Strategy |
| --- | --- | --- |
| **Tier 1 LLM** *(Claude/GPT)* | Intercept call in `ModelRouter` | Hot-swap instantly to **Gemini Flash** or local **Ollama** instance. |
| **All AI Services** | Flag task status as `INTELLIGENCE_DEGRADED` | Complete the workflow using purely deterministic regex/string extraction; skip synthesis. |
| **Target Website** *(e.g., LinkedIn)* | Catch DOM timeout error within 15s | Return latest cached results from `Redis` (even if older than 24h); notify user. |
