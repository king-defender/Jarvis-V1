# ADR-002: Deterministic Rule Engine

* **Status:** Approved
* **Context:** Using LLM context windows to filter, score, or match parsed elements (like job salaries or keywords) is costly, slow, and unpredictable.
* **Decision:** Build a stateless, schema-driven evaluation engine (`RuleEngineEvaluator`) running field logic deterministically in code.
* **Consequences:** Eliminates AI call costs and latency for simple filtering rules; guarantees zero hallucination rates.
