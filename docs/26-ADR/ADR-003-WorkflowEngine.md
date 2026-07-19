# ADR-003: Stateful Workflow Coordinator

* **Status:** Approved
* **Context:** Complex automations require step-by-step state management, context accumulation, and failure handling.
* **Decision:** Build a custom, lightweight state coordinator class (`WorkflowCoordinator`) that integrates with Redis tasks queues.
* **Consequences:** Provides robust transaction status checks and rollback logic for parallel step pipelines.
