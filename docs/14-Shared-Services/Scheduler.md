# Scheduler Shared Service Specification

The Scheduler Shared Service handles node-cron registrations.

---

## 1. Description
Parses cron expressions, assigns system task callbacks, monitors active schedule registers, and cleans up jobs.

---

## 2. API Contract
```typescript
export interface ISchedulerService {
  registerJob(cronExpression: string, jobCallback: () => Promise<void>): string;
  cancelJob(jobId: string): void;
}
```
