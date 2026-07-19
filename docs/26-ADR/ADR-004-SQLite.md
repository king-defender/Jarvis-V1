# ADR-004: SQLite Transactional Store

* **Status:** Approved
* **Context:** CommandOS requires a fast transactional store for local execution environments.
* **Decision:** Use SQLite as the single-file relational source of truth.
* **Consequences:** Eliminates external server installations; simplifies database migrations and backups.
