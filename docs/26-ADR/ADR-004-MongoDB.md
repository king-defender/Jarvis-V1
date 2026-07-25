# ADR-004: MongoDB Document Store

* **Status:** Approved
* **Context:** Workflows, task structures, rule evaluations, and user preference profiles in CommandOS are dynamic and deeply nested JSON objects. Storing these objects in a relational store (like SQLite) requires excessive join queries, complex relational schema mapping, and manual string serialization/deserialization on every read/write.
* **Decision:** Replace SQLite with MongoDB as the core application database.
* **Consequences:**
  * Nested arrays (such as the task execution array within a Workflow document) are updated and retrieved atomically.
  * Eliminates object-relational mapping boilerplate code.
  * Allows developers to run MongoDB locally in a Docker container or connect to MongoDB Atlas instances in cloud environments.
