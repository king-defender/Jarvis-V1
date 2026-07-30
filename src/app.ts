import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { loadConfig } from './config.js';
import { createApiRouter } from './control/api/router.js';
import { transactionIdMiddleware } from './control/api/transaction.middleware.js';
import { CommandRouter } from './control/command-engine/command.router.js';
import { getAutomationCommandRegistrations } from './domain/modules/automation/automation.module.js';
import { getBrowserModuleCommandRegistrations } from './domain/modules/browser/browser.module.js';
import { getCareerCommandRegistrations } from './domain/modules/career/career.module.js';
import { getCareerJobApplicationWorkflow } from './domain/modules/career/job-application.workflow.js';
import { getCommunicationCommandRegistrations } from './domain/modules/communication/communication.module.js';
import { getDevelopmentCommandRegistrations } from './domain/modules/development/development.module.js';
import { getFinanceCommandRegistrations } from './domain/modules/finance/finance.module.js';
import { getLearningCommandRegistrations } from './domain/modules/learning/learning.module.js';
import { getStartupCommandRegistrations } from './domain/modules/startup/startup.module.js';
import { getDemoWorkflowDefinition } from './domain/modules/system/demo.workflow.js';
import { getSystemCommandRegistrations } from './domain/modules/system/system.module.js';
import { ModelRouterService } from './infrastructure/ai/model-router.service.js';
import { CacheService } from './infrastructure/cache/redis.service.js';
import { DatabaseService } from './infrastructure/database/connection.service.js';
import { BrowserService } from './infrastructure/services/browser.service.js';
import { SystemEventBus } from './infrastructure/services/event-bus.service.js';
import { GitHubService } from './infrastructure/services/github.service.js';
import { LoggingService } from './infrastructure/services/logging.service.js';
import { SchedulerService } from './infrastructure/services/scheduler.service.js';
import { SearchService } from './infrastructure/services/search.service.js';
import { StorageService } from './infrastructure/services/storage.service.js';
import { TenantService } from './infrastructure/services/tenant.service.js';
import { ApprovalService } from './orchestration/approval/approval.service.js';
import {
  QueueService,
  WORKFLOW_TASK_QUEUE,
} from './orchestration/queue/queue.service.js';
import { WorkflowRuntime } from './orchestration/workflow/workflow.runtime.js';
import type { WorkflowDefinition } from './orchestration/workflow/workflow.types.js';
import type { SystemCommandDirective } from './shared/types/command.types.js';

function getParallelDemoWorkflow(): WorkflowDefinition {
  return {
    name: 'system.parallel-demo',
    steps: [
      {
        id: 'a',
        name: 'ping-a',
        command: 'system.ping',
        payloadMapping: { message: 'alpha' },
        retryAttempts: 0,
        parallelGroup: 'wave-1',
      },
      {
        id: 'b',
        name: 'ping-b',
        command: 'system.ping',
        payloadMapping: { message: 'beta' },
        retryAttempts: 0,
        parallelGroup: 'wave-1',
      },
      {
        id: 'c',
        name: 'ping-c',
        command: 'system.ping',
        payloadMapping: { message: 'gamma' },
        retryAttempts: 0,
      },
    ],
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  fs.mkdirSync(config.app.baseDataPath, { recursive: true });

  const log = new LoggingService(config);
  const eventBus = new SystemEventBus();
  const database = new DatabaseService(config, log);
  const cache = new CacheService(config, log);
  const queue = new QueueService(config, log);
  const scheduler = new SchedulerService();
  const browser = new BrowserService(config, log);
  const search = new SearchService(log, config.search.apiUrl);
  const github = new GitHubService(config, log);
  const modelRouter = new ModelRouterService(config, log);

  await database.connect();
  await database.migrate();
  await cache.connect();

  const storage = new StorageService(database.getDb(), database.getClient());
  const approvalService = new ApprovalService(storage, eventBus);
  const tenantService = new TenantService(storage);
  const defaultTenant = await tenantService.ensureDefaultTenant();
  await tenantService.upsertUser({
    tenantId: defaultTenant.id,
    email: 'local@commandos.dev',
    displayName: 'Local Owner',
    role: 'owner',
  });

  if (cache.isReady()) {
    queue.enable();
  }

  const commandRouter = new CommandRouter(eventBus, database.getDb());

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

  const runCommand = async (directive: SystemCommandDirective) =>
    commandRouter.route(directive);

  const registrations = [
    ...getSystemCommandRegistrations(),
    ...getCareerCommandRegistrations({ storage, search, browser, github, eventBus }),
    ...getDevelopmentCommandRegistrations({
      storage,
      github,
      eventBus,
      baseDataPath: config.app.baseDataPath,
    }),
    ...getStartupCommandRegistrations({ storage, browser, modelRouter, eventBus }),
    ...getLearningCommandRegistrations({ storage, modelRouter, eventBus }),
    ...getFinanceCommandRegistrations({ storage, eventBus }),
    ...getCommunicationCommandRegistrations({
      storage,
      modelRouter,
      eventBus,
      ...(config.integrations.slackWebhookUrl
        ? { webhookUrl: config.integrations.slackWebhookUrl }
        : {}),
    }),
    ...getBrowserModuleCommandRegistrations({
      storage,
      browser,
      eventBus,
      baseDataPath: config.app.baseDataPath,
    }),
    ...getAutomationCommandRegistrations({
      storage,
      scheduler,
      eventBus,
      startWorkflow: (input) => workflowRuntime.start(input),
      runCommand,
    }),
  ];
  for (const registration of registrations) {
    commandRouter.register(registration);
  }

  workflowRuntime.register(getDemoWorkflowDefinition());
  workflowRuntime.register(getCareerJobApplicationWorkflow());
  workflowRuntime.register(getParallelDemoWorkflow());

  if (queue.isEnabled()) {
    workflowRuntime.setEnqueue(async (job) =>
      queue.addJob(WORKFLOW_TASK_QUEUE, job),
    );
  }

  queue.registerWorker(WORKFLOW_TASK_QUEUE, async (job) => {
    const resumeId =
      typeof job.payload.__resumeWorkflowId === 'string'
        ? job.payload.__resumeWorkflowId
        : job.workflowId;
    await workflowRuntime.continueQueued(resumeId, job.userId);
  });

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
    '/dashboard',
    express.static(path.resolve('public/dashboard'), { index: 'index.html' }),
  );
  app.use(
    '/widgets',
    express.static(path.resolve('public/widgets'), { index: 'index.html' }),
  );
  app.use(
    '/api',
    createApiRouter({
      config,
      database,
      cache,
      commandRouter,
      workflowRuntime,
      approvalService,
      tenantService,
    }),
  );

  const server = app.listen(config.app.port, () => {
    log.info('CommandOS API listening', {
      port: config.app.port,
      env: config.app.env,
      commands: commandRouter.listCommands().length,
      workflows: workflowRuntime.list(),
      queueEnabled: queue.isEnabled(),
      tenant: defaultTenant.slug,
      dashboard: `http://localhost:${config.app.port}/dashboard/`,
      widgets: `http://localhost:${config.app.port}/widgets/?id=status`,
    });
  });

  const shutdown = async (signal: string) => {
    log.info('Shutting down', { signal });
    scheduler.stopAll();
    server.close();
    await browser.closeAll();
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
