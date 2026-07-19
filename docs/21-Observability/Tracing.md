# Observability: Tracing Specification

This document details call tracing.

---

## 1. Trace Propagation
Propagates `transactionId` across the API Gateway, Command Router, Workflow step executors, and low-level tools.
