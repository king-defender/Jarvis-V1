import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import { loadConfig } from './config.js';
import { createApiRouter } from './control/api/router.js';
import { transactionIdMiddleware } from './control/api/transaction.middleware.js';
import { CommandRouter } from './control/command-engine/command.router.js';
import { getDemoWorkflowDefinition } from './domain/modules/system/demo.workflow.js';
import { getSystemCommandRegistrations } from './domain/modules/system/system.module.js';
import { CacheService } from './infrastructure/cache/redis.service.js';
import { DatabaseService } from './infrastructure/database/connection.service.js';
import { SystemEventBus } from './infrastructure/services/event-bus.service.js';
import { LoggingService } from './infrastructure/services/logging.service.js';
import { SchedulerService } from './infrastructure/services/scheduler.service.js';
import {
  QueueService,
  WORKFLOW_TASK_QUEUE,
} from './orchestration/queue/queue.service.js';
import { WorkflowRuntime } from './orchestration/workflow/workflow.runtime.js';
import type { SystemCommandDirective } from './shared/types/command.types.js';

async function main(): Promise<void> {
  const config = loadConfig();
  fs.mkdirSync(config.app.baseDataPath, { recursive: true });

  const log = new LoggingService(config);
  const eventBus = new SystemEventBus();
  const database = new DatabaseService(config, log);
  const cache = new CacheService(config, log);
  const queue = new QueueService(config, log);
  const scheduler = new SchedulerService();

  await database.connect();
  await database.migrate();
  await cache.connect();

  if (cache.isReady()) {
    queue.enable();
  }

  const commandRouter = new CommandRouter(eventBus, database.getDb());
  for (const registration of getSystemCommandRegistrations()) {
    commandRouter.register(registration);
  }

  const workflowRuntime = new WorkflowRuntime(
    database.getDb(),
    eventBus,
    log,
    async (command, payload, options) => {
      const directive: SystemCommandDirective = {
        transactionId: randomUUID(),
        command,
        timestamp: new Date().toISOString(),
        payload,
        context: {
          userId: options.userId,
          triggerSource: options.triggerSource,
          bypassCache: options.bypassCache ?? false,
        },
      };
      return commandRouter.route(directive);
    },
  );

  workflowRuntime.register(getDemoWorkflowDefinition());

  queue.registerWorker(WORKFLOW_TASK_QUEUE, async (job) => {
    await workflowRuntime.start({
      name: job.command,
      userId: job.userId,
      payload: job.payload,
      transactionId: job.transactionId,
    });
  });

  // Example cron registration (disabled by default; enable via env later)
  if (config.app.env === 'development' && process.env.ENABLE_DEMO_CRON === 'true') {
    scheduler.registerJob('*/5 * * * *', async () => {
      log.info('Demo cron tick');
      await workflowRuntime.start({
        name: 'system.demo',
        userId: 'cron-user',
        payload: { message: 'cron', followUp: 'cron-2' },
      });
    });
  }

  eventBus.subscribe('*', (event) => {
    log.info('system.event', {
      eventName: event.eventName,
      transactionId: event.transactionId,
      producer: event.producer,
    });
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(transactionIdMiddleware);
  app.use(
    '/api',
    createApiRouter({
      config,
      database,
      cache,
      commandRouter,
      workflowRuntime,
    }),
  );

  const server = app.listen(config.app.port, () => {
    log.info('CommandOS API listening', {
      port: config.app.port,
      env: config.app.env,
      commands: commandRouter.listCommands(),
      workflows: workflowRuntime.list(),
      queueEnabled: queue.isEnabled(),
    });
  });

  const shutdown = async (signal: string) => {
    log.info('Shutting down', { signal });
    scheduler.stopAll();
    server.close();
    await queue.close();
    await cache.disconnect();
    await database.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
