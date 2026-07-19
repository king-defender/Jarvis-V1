# ADR-001: Centralized Command Engine

* **Status:** Approved
* **Context:** We need a unified gateway to validate, audit, and dispatch ingress payloads to domain modules.
* **Decision:** Implement a centralized router (`CommandRouter`) acting as the single control entry point.
* **Consequences:** All ingress routes (CLI, Webhook, REST) must conform to `SystemCommandDirective` schemas. Ensures strict transaction tracing.
