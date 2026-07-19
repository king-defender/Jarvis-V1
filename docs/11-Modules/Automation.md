# Automation Module Specification

The Automation Module manages cron schedules, webhook setups, external API triggers, and automated system routines.

---

## 1. Domain Capabilities & Responsibilities
* Parse and register custom cron schedule parameters.
* Listen for, validate, and parse incoming webhook signatures.
* Invoke workflow coordinates upon matching system triggers.
* Record execution stats for automated schedules.

---

## 2. Commands Registered

### `automation.register-trigger`
* **Input:** `{ name: string, cron: string, command: string, payload: Record<string, any> }`
* **Output:** `{ triggerId: string, nextRunAt: string }`

### `automation.run-workflow`
* **Input:** `{ workflowName: string, inputPayload: Record<string, any> }`
* **Output:** `{ workflowExecutionId: string, status: string }`

---

## 3. Emitted Events
* `automation.trigger_registered`
* `automation.trigger_fired`

---

## 4. Skills Utilized
* `DeploymentSkill`
* `JobSearchSkill`

---

## 5. Database Schema Extensions

```sql
CREATE TABLE IF NOT EXISTS automation_triggers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cron_expression TEXT,
    target_command TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_fired_at TEXT,
    created_at TEXT NOT NULL
);
```

---

## 6. AI Usage Guidelines
* **Automation Logic:** 100% deterministic code. AI is **never** used in cron parsing, trigger validation, or scheduling calculations.
