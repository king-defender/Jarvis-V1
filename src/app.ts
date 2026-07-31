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
import { getPlatformCommandRegistrations } from './domain/modules/platform/platform.module.js';
import { getStartupCommandRegistrations } from './domain/modules/startup/startup.module.js';
import { getDemoWorkflowDefinition } from './domain/modules/system/demo.workflow.js';
import { getSystemCommandRegistrations } from './domain/modules/system/system.module.js';
import { DecisionEngine } from './evaluation/decision/decision-engine.js';
import {
  EvaluationService,
  PromptLibrary,
  SafetyService,
} from './infrastructure/ai/prompt-safety-eval.js';
import { ModelRouterService } from './infrastructure/ai/model-router.service.js';
import { CacheService } from './infrastructure/cache/redis.service.js';
import {
  ConnectorRegistry,
  HttpConnector,
} from './infrastructure/connectors/connector.js';
import { DatabaseService } from './infrastructure/database/connection.service.js';
import {
  MetricsService,
  TracingService,
} from './infrastructure/observability/metrics.js';
import { PluginLoader } from './infrastructure/plugins/plugin-loader.js';
import {
  createAuditMiddleware,
  createRateLimitMiddleware,
} from './infrastructure/security/http-guards.js';
import { BrowserService } from './infrastructure/services/browser.service.js';
import { EmailService } from './infrastructure/services/email.service.js';
import { SystemEventBus } from './infrastructure/services/event-bus.service.js';
import { FilesystemService } from './infrastructure/services/filesystem.service.js';
import { GitHubService } from './infrastructure/services/github.service.js';
import { LoggingService } from './infrastructure/services/logging.service.js';
import { NotificationService } from './infrastructure/services/notification.service.js';
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
import { VersionRegistry } from './shared/versioning/version-registry.js';

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
  const prompts = new PromptLibrary();
  const safety = new SafetyService();
  const evaluation = new EvaluationService(modelRouter);

  await database.connect();
  await database.migrate();
  await cache.connect();
  await browser.init();

  const storage = new StorageService(database.getDb(), database.getClient());
  const approvalService = new ApprovalService(storage, eventBus);
  const tenantService = new TenantService(storage);
  const filesystem = new FilesystemService(config.app.baseDataPath);
  const email = new EmailService(config, storage, log);
  const notifications = new NotificationService(storage, log);
  const decisionEngine = new DecisionEngine();
  const metrics = new MetricsService();
  const tracing = new TracingService();
  const connectors = new ConnectorRegistry();
  const healthConnector = new HttpConnector('health-self');
  await healthConnector.initialize({
    baseUrl: `http://127.0.0.1:${config.app.port}/api/health`,
    rateLimitLimit: 60,
    rateLimitWindowMs: 60_000,
  });
  connectors.register(healthConnector);

  if (config.github.token) {
    const { GitHubConnector } = await import('./infrastructure/connectors/providers.js');
    const gh = new GitHubConnector();
    await gh.initialize({
      baseUrl: 'https://api.github.com',
      oauthToken: config.github.token,
      rateLimitLimit: 30,
      rateLimitWindowMs: 60_000,
    });
    connectors.register(gh);
  }

  if (config.integrations.slackWebhookUrl) {
    const { SlackWebhookConnector } = await import('./infrastructure/connectors/providers.js');
    const slack = new SlackWebhookConnector();
    await slack.initialize({
      baseUrl: config.integrations.slackWebhookUrl,
      rateLimitLimit: 20,
      rateLimitWindowMs: 60_000,
    });
    connectors.register(slack);
  }

  const pluginLoader = new PluginLoader(path.resolve('plugins'), log);
  await pluginLoader.loadAll();

  const workflowVersions = new VersionRegistry<WorkflowDefinition>();
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
    ...getCareerCommandRegistrations({
      storage,
      search,
      browser,
      github,
      eventBus,
      modelRouter,
      prompts,
      safety,
    }),
    ...getDevelopmentCommandRegistrations({
      storage,
      github,
      eventBus,
      baseDataPath: config.app.baseDataPath,
      modelRouter,
      prompts,
      safety,
    }),
    ...getStartupCommandRegistrations({
      storage,
      browser,
      modelRouter,
      eventBus,
      prompts,
      safety,
    }),
    ...getLearningCommandRegistrations({ storage, modelRouter, eventBus }),
    ...getFinanceCommandRegistrations({ storage, eventBus }),
    ...getCommunicationCommandRegistrations({
      storage,
      modelRouter,
      eventBus,
      email,
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
    ...getPlatformCommandRegistrations({
      storage,
      filesystem,
      email,
      notifications,
      modelRouter,
      connectors,
      eventBus,
      decisionEngine,
      approvalService,
      runCommand,
      baseDataPath: config.app.baseDataPath,
      prompts,
      safety,
      evaluation,
      ...(config.integrations.slackWebhookUrl
        ? { slackWebhookUrl: config.integrations.slackWebhookUrl }
        : {}),
    }),
    ...pluginLoader.getCommands(),
  ];
  for (const registration of registrations) {
    commandRouter.register(registration);
  }

  const demoWorkflow = getDemoWorkflowDefinition();
  const careerWorkflow = getCareerJobApplicationWorkflow();
  const parallelWorkflow = getParallelDemoWorkflow();
  workflowRuntime.register(demoWorkflow);
  workflowRuntime.register(careerWorkflow);
  workflowRuntime.register(parallelWorkflow);
  workflowVersions.register({
    name: demoWorkflow.name,
    version: 1,
    schemaVersion: 1,
    definition: demoWorkflow,
  });
  workflowVersions.register({
    name: careerWorkflow.name,
    version: 1,
    schemaVersion: 1,
    definition: careerWorkflow,
  });
  workflowVersions.register({
    name: parallelWorkflow.name,
    version: 1,
    schemaVersion: 1,
    definition: parallelWorkflow,
  });

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
    metrics.incr('events.total');
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
  app.use(createRateLimitMiddleware({ windowMs: 60_000, max: 300 }));
  app.use(createAuditMiddleware(storage));
  app.use(
    '/dashboard',
    express.static(path.resolve('public/dashboard'), { index: 'index.html' }),
  );
  app.use(
    '/widgets',
    express.static(path.resolve('public/widgets'), { index: 'index.html' }),
  );
  app.get('/openapi.json', (_req, res) => {
    res.sendFile(path.resolve('public/openapi.json'));
  });
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
      metrics,
      tracing,
      plugins: pluginLoader,
      connectors,
      decisionEngine,
      workflowVersions,
      storage,
      notifications,
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
      plugins: pluginLoader.list().map((p) => p.id),
      connectors: connectors.list(),
      dashboard: `http://localhost:${config.app.port}/dashboard/`,
      widgets: `http://localhost:${config.app.port}/widgets/?id=status`,
      openapi: `http://localhost:${config.app.port}/openapi.json`,
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
