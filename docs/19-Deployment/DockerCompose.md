# Deployment: Docker Compose Specification

This document details the multi-container compose orchestration.

---

## 1. Containers
* `command-os-api`: The Express server container.
* `redis-cache`: Background Redis queue container.
* `postgres-db`: Optional secondary database container.
