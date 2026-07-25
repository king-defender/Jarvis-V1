import type { JobsOptions, Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import type { SystemConfig } from '../../config.js';
import type { ILoggingService } from '../../infrastructure/services/logging.service.js';

export interface QueuedTaskJob {
  transactionId: string;
  taskId: string;
  workflowId: string;
  command: string;
  payload: Record<string, unknown>;
  retryAttempts: number;
  userId: string;
}

export interface IQueueService {
  addJob(
    queueName: string,
    data: QueuedTaskJob,
    options?: JobsOptions,
  ): Promise<string>;
  registerWorker(
    queueName: string,
    workerCallback: (job: QueuedTaskJob) => Promise<void>,
  ): void;
  close(): Promise<void>;
}

export class QueueService implements IQueueService {
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private readonly inlineHandlers = new Map<
    string,
    (job: QueuedTaskJob) => Promise<void>
  >();
  private enabled = false;

  constructor(
    private readonly config: SystemConfig,
    private readonly log: ILoggingService,
  ) {}

  enable(): void {
    this.enabled = true;
    this.log.info('Queue service enabled (BullMQ)');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private getQueue(queueName: string): Queue {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, {
        connection: { url: this.config.cache.redisUrl },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 100,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      });
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  async addJob(
    queueName: string,
    data: QueuedTaskJob,
    options?: JobsOptions,
  ): Promise<string> {
    if (!this.enabled) {
      const handler = this.inlineHandlers.get(queueName);
      if (handler) {
        await handler(data);
      }
      return `inline-${data.taskId}`;
    }

    const queue = this.getQueue(queueName);
    const job = await queue.add(data.command, data, options);
    return String(job.id);
  }

  registerWorker(
    queueName: string,
    workerCallback: (job: QueuedTaskJob) => Promise<void>,
  ): void {
    this.inlineHandlers.set(queueName, workerCallback);

    if (!this.enabled) {
      this.log.warn('Queue worker registered in inline mode (Redis unavailable)', {
        queueName,
      });
      return;
    }

    const worker = new Worker(
      queueName,
      async (job: Job<QueuedTaskJob>) => {
        await workerCallback(job.data);
      },
      {
        connection: { url: this.config.cache.redisUrl },
        concurrency: this.config.queue.maxConcurrency,
      },
    );

    worker.on('failed', (job, err) => {
      this.log.error('Queue job failed', {
        queueName,
        jobId: job?.id,
        error: err.message,
      });
    });

    this.workers.push(worker);
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.workers.length = 0;
    this.queues.clear();
  }
}

export const WORKFLOW_TASK_QUEUE = 'command_os_task_queue';
