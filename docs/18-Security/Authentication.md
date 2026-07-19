# Security Authentication Specification

This document details the authentication strategies for CommandOS client API interfaces.

---

## 1. Strategies
* **JWT Validation:** Protects REST endpoints using HMAC-SHA256 signature verifications.
* **API Key Checks:** For CLI/Webhook triggers, verified against SQLite-stored hashes.
