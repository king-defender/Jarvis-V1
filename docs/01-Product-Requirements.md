# Product Requirements Document (PRD)

## 1. Product Vision

CommandOS is a personal automation command center designed to give developers and power users absolute control over their digital workflows. Unlike traditional orchestrators that rely heavily on expensive, unpredictable LLM routing, CommandOS uses a **local-first, deterministic execution runtime** with a high-speed rule engine. AI is strictly leveraged as a utility for unstructured text parsing, classification, and synthesis.

---

## 2. Core Goals

1. **Predictability:** Ensure that 100% of routing and decision-making logic is deterministic and auditable.
2. **Speed & Efficiency:** Execute local commands and data rules instantly (sub-millisecond evaluation times) with negligible resource overhead.
3. **Robust Web Automation:** Crawl, scrape, and extract data from websites (e.g., job boards, GitHub) with intelligent DOM extraction, caching, and network timeout handling.
4. **Graceful Failover:** Guarantee that API network drops or AI service outages do not crash running workflows, instead downgrading to local models or cached results.

---

## 3. User Personas

### The Automating Developer
* **Needs:** Wants a robust local tool to run cron-based web tasks, parse PDFs, and filter data (e.g., job listings, competitor pricing) based on custom logic.
* **Behaviors:** Prefers CLI interfaces, config-as-code (JSON rules), and deep auditable logs.
* **Pain Points:** Frustrated by brittle web scraping tools, slow cloud-native SaaS orchestrators, and AI agents that hallucinate or trigger unnecessary API billing.

---

## 4. Scope

### In-Scope (MVP & V1)
* **Unified Command System:** CLI-driven execution, HTTP API Gateway, and background cron schedules.
* **Stateful Workflow Engine:** Linear and parallel execution paths, task status persistence, and step retry mechanics.
* **High-Speed Rule Evaluator:** A schema-driven engine running field comparisons and array matching via dot-notation.
* **Local Data Store:** A single-file SQLite database for local configurations, states, and history logs.
* **Transient Cache Layer:** A local Redis client for DOM caching, model routing, and state queuing.
* **Model Router Utility:** Automatic model-switching (Claude to Gemini to local Ollama) based on costs and availability.

### Out-of-Scope
* **Multi-Tenant SaaS Platform:** CommandOS is built to run locally or self-hosted in a private environment. Multitenancy, global tenant billing, and shared compute clusters are excluded.
* **Visual Node-Graph Editor:** Workflows are written in code/JSON. No visual drag-and-drop workflow builder will be built in the initial stages.

---

## 5. Success Metrics & Performance KPIs

| Metric | Target Goal | Measurement Mechanism |
| --- | --- | --- |
| **Command Routing Latency** | < 20ms | Internal logger trace measuring `CommandRouter.route` |
| **Rule Engine Evaluation** | < 5ms per 1,000 items | Benchmark suite running on nested JSON inputs |
| **Idle Memory Footprint** | < 150MB | Node.js process memory usage metrics |
| **AI Degradation Success** | 100% recovery | Simulation tests with artificially blocked Tier-1 LLM endpoints |
| **DOM Crawl Timeout Recovery** | < 15s cutoff | Playwright wrapper checking Redis caching behavior upon failure |
