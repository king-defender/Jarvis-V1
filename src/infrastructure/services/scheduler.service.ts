import { randomUUID } from 'node:crypto';
import cron, { type ScheduledTask } from 'node-cron';

export interface ISchedulerService {
  registerJob(cronExpression: string, jobCallback: () => Promise<void>): string;
  cancelJob(jobId: string): void;
  listJobs(): string[];
  stopAll(): void;
}

export class SchedulerService implements ISchedulerService {
  private readonly jobs = new Map<string, ScheduledTask>();

  registerJob(cronExpression: string, jobCallback: () => Promise<void>): string {
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const jobId = randomUUID();
    const task = cron.schedule(cronExpression, () => {
      void jobCallback().catch(() => {
        // Errors are handled by caller logging inside jobCallback
      });
    });

    this.jobs.set(jobId, task);
    return jobId;
  }

  cancelJob(jobId: string): void {
    const task = this.jobs.get(jobId);
    if (!task) {
      return;
    }
    task.stop();
    this.jobs.delete(jobId);
  }

  listJobs(): string[] {
    return [...this.jobs.keys()];
  }

  stopAll(): void {
    for (const [jobId, task] of this.jobs) {
      task.stop();
      this.jobs.delete(jobId);
    }
  }
}
