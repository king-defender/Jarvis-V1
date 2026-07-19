# ADR-006: Hybrid Event Bus Architecture

* **Status:** Approved
* **Context:** Heavy backend crawling tasks block API routers; telemetry systems need decoupled event logging.
* **Decision:** Implement a local in-memory event emitter for logging/stats and a Redis-backed queue worker for long tasks.
* **Consequences:** Protects API latency bounds and handles backoff retries for third-party endpoints.
