# Deployment: Monitoring Specification

This document details service checking.

---

## 1. Health Checks
Provides a `/health` REST endpoint to query SQLite connections, Redis statuses, and active queue counts.
