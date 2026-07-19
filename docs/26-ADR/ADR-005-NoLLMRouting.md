# ADR-005: Ban on LLM-Driven Orchestration

* **Status:** Approved
* **Context:** Letting AI agents dynamically decide execution routing steps introduces indeterminism and security risks (like prompt injections).
* **Decision:** Prohibit LLMs from determining control paths or executing terminal routes directly. AI operates purely as low-level data processors.
* **Consequences:** Restricts LLM calls to inputs/outputs parsing tasks under static system control pipelines.
