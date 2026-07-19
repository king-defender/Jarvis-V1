# Versioning Specification

This document details how CommandOS version-controls rules, workflows, data models, and database migrations to allow seamless updates without interrupting active executions.

---

## 1. Workflow Definition Versioning

Workflows executed by the platform are registered with explicit version metadata:

```typescript
export interface VersionedWorkflowDefinition {
  name: string;
  version: number;            // E.g., 1, 2, 3
  steps: WorkflowStep[];
}
```

### Side-by-Side Execution Policy:
* **Active Execution Lock:** When a workflow is triggered, the runtime locks the instance to the active `version` (e.g., `JobSearchWorkflow v1`).
* **Safe Deploys:** Deploying `JobSearchWorkflow v2` does not impact running instances of v1. The `WorkflowCoordinator` runs both concurrently by querying the target version config linked to the active SQLite row.
* **Deprecation Policy:** Deprecated workflows are flagged as `is_deprecated = 1` in the database, blocking new invocations while permitting active threads to resolve.

---

## 2. Rule Schema Versioning

Deterministic rules are structured as JSON. If rule definitions change (e.g. adding new operators):
* **Upstream Mapping:** Evaluators check rule schema version markers (`schemaVersion: 1`).
* **Backward Compatibility:** Evaluators default to v1 parsing rules if version markers are absent.

---

## 3. Database Migration Policy

Database migrations must run sequentially using Knex/SQL files located under `/database/migrations/`:

* **Naming Rule:** `YYYYMMDDHHMMSS_migration_name.sql` (e.g. `20260719183000_create_workflows_table.sql`).
* **Up / Down migrations:** Every migration must expose an `up` and a `down` block for schema rollbacks.
* **No Breaking Changes:** Modifications must avoid deleting columns. If fields are removed, mark them as deprecated and delete them in subsequent major versions to preserve running transaction logs.
