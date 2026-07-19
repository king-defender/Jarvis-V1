# Engineering Principles

This document defines the core engineering philosophy, architectural rules, and operational constraints that govern the design and development of CommandOS.

---

## 1. Core Philosophy: AI as a Utility, Not an Orchestrator

The most critical architectural constraint of CommandOS is the separation of execution control from generative intelligence.

* **Deterministic Orchestration:** Workflows, commands, routes, and logical branches must be written in static code, state machines, or deterministic rules (the Rule Engine). AI must never decide *which* step to execute next or *how* to route a command.
* **Low-Level Isolation:** AI models (LLMs) reside strictly within the **Infrastructure Layer** (Layer 5). They are called as utility functions for non-deterministic tasks such as:
  * Text summarization or synthesis
  * Unstructured data extraction (e.g., parsing raw DOM into structured JSON)
  * Multi-class classification (e.g., categorizing an email thread)
* **Intelligence Degradation:** If all AI services are unavailable or timed out, the system must downgrade to a deterministic fallback (e.g., basic regex parser or string matcher) rather than crashing the workflow.

---

## 2. Downward-Only Dependency Flow

Dependency directions are strictly vertical.

* **Unidirectional Flow:** Higher-level directories can import from lower-level directories, but lower-level directories must have **zero knowledge** of anything above them.
* **Zero Cyclic Dependencies:** Circular references between layers, modules, or skills are strictly prohibited.
* **Strict Boundary Enforcement:**
  1. `control` -> Orchestrates calls to `orchestration` and `evaluation`.
  2. `orchestration` -> Calls `evaluation`, `domain`, and `infrastructure`.
  3. `evaluation` -> Runs calculations on data. Pure and stateless.
  4. `domain` -> Contains the modules and pluggable skills.
  5. `infrastructure` -> Reusable clients (database, cache, HTTP, AI model router). No domain or orchestration context allowed.

---

## 3. Data Immutability and State Isolation

State corruption is a major issue in concurrent systems. CommandOS enforces deep-frozen inputs and outputs.

* **Frozen Payloads:** Data passed between modules and skills are deeply cloned and frozen (`Object.freeze()`) to eliminate side effects during parallel task execution.
* **Pure Context Propagation:** Workflows maintain execution context as an append-only sequence of immutable state steps. A task can read previous outputs, but cannot modify them.
* **No Shared Memory:** Skills must not share in-memory states. If persistence is required, it must be performed through the Database Service (SQLite) or Cache Service (Redis).

---

## 4. Local-First & Performance Constraints

CommandOS is designed to run efficiently on local developer machines as well as distributed cloud environments.

* **Lightweight Footprint:** Keep local CPU and memory usage minimal. Heavy operations (e.g., Playwright scraping browser instances) must be pooled and recycled.
* **SQLite as Source of Truth:** SQLite is the transactional database. All relational configurations, execution logs, and workflow states must use SQLite.
* **Redis Caching:** External API calls, DOM scraping responses, and intermediate LLM outputs must be cached in Redis with a default TTL to avoid redundant network overhead and API costs.

---

## 5. Traceability and Auditability

Every operation in the system must be trackable.

* **Single Transaction Context:** Every system invocation starts with a `transactionId` (UUIDv4) that propagates through every layer (API, Command Engine, Workflow Engine, Rule Engine, Skills, and Infrastructure).
* **Verbose Database Logs:** Execution logs (successes, warnings, and failures) are flushed to the `command_directives` and `tasks` tables in SQLite to enable debugging.
* **Reproducibility:** Given the same transaction payload, rule configurations, and cached website inputs, a workflow must be fully reproducible.
