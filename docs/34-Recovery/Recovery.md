# Error Recovery Strategy Spec

The Error Recovery Strategy handles runtime exceptions, network disconnects, API drops, and half-completed workflow failures. It details retries, compensation transactions (Saga pattern), and Dead Letter Queue (DLQ) operations.

---

## 1. Error Categorization & Actions

| Error Class | Example | Immediate Strategy | Recovery Action |
| --- | --- | --- | --- |
| **Transient Network** | HTTP 503, API rate limits (429) | Auto-Retry | Exponential backoff with random jitter. |
| **Authentication** | Expired API Key, OAuth fail | Immediate Abort | Skip retries; flag task as `FAILED`; trigger user alert. |
| **Downstream Outage** | LLM API timeout | Failover | Switch models (Claude -> Gemini -> local Ollama). |
| **Logical Violation** | Input fails schema validation | Immediate Drop | Log failure details; abort workflow. |

---

## 2. Retries & Backoff Policies

For transient failures in background workers:
* **Initial Delay:** 1000ms.
* **Multiplier:** 2.
* **Maximum Delay:** 30000ms.
* **Max Attempts:** 3.
* **Jitter:** Add random milliseconds between `[-100ms, +100ms]` to prevent thundering herd scenarios.

---

## 3. Compensation Transactions (Saga Pattern)

Workflows must not leave side-effects if aborted midway. Each task in a workflow must define a `compensate` method (if non-idempotent):

```typescript
export interface CompensableTask {
  execute(payload: any): Promise<any>;
  compensate(payload: any): Promise<void>; // Undoes the execution actions
}
```

### Saga Coordination Pipeline:
* Suppose a workflow runs: `Step A (Create Local Draft)` -> `Step B (Publish to Slack)` -> `Step C (Email User)`.
* If **Step C fails** permanently after exhausting retries:
  * The Coordinator aborts the forward pipeline.
  * It triggers compensating paths in reverse order: `Compensate Step B (Delete Slack Message)` -> `Compensate Step A (Delete Local Draft)`.
  * Updates workflow status in SQLite to `FAILED`.

---

## 4. Dead Letter Queue (DLQ)

If a background job on the Redis task queue exhausts its retries:
1. It is popped from the execution loop and pushed to the `command_os_dlq` Redis queue.
2. The runtime inserts a log record in the `dlq_failures` database.
3. The dashboard alerts the user via a red icon.
4. Users can inspect the exact payload, variables snapshot, and error trace, with options to **Force Run**, **Modify Payload & Retry**, or **Drop**.
