import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import type { SystemConfig } from '../../config.js';
import type { DecisionEngine } from '../../evaluation/decision/decision-engine.js';
import type { CacheService } from '../../infrastructure/cache/redis.service.js';
import type { ConnectorRegistry } from '../../infrastructure/connectors/connector.js';
import type { DatabaseService } from '../../infrastructure/database/connection.service.js';
import type {
  MetricsService,
  TracingService,
} from '../../infrastructure/observability/metrics.js';
import type { PluginLoader } from '../../infrastructure/plugins/plugin-loader.js';
import type { ApprovalService } from '../../orchestration/approval/approval.service.js';
import type { WorkflowRuntime } from '../../orchestration/workflow/workflow.runtime.js';
import type { WorkflowDefinition } from '../../orchestration/workflow/workflow.types.js';
import { DEFAULT_DESKTOP_WIDGETS } from '../../infrastructure/services/widgets.js';
import type { TenantService } from '../../infrastructure/services/tenant.service.js';
import type { IStorageService } from '../../infrastructure/services/storage.service.js';
import type { INotificationService } from '../../infrastructure/services/notification.service.js';
import type { VersionRegistry } from '../../shared/versioning/version-registry.js';
import {
  TriggerSourceSchema,
  type SystemCommandDirective,
} from '../../shared/types/command.types.js';
import { createAuthMiddleware, createDevToken } from '../auth/auth.middleware.js';
import type { CommandRouter } from '../command-engine/command.router.js';
import { canExecuteCommand } from '../../infrastructure/security/rbac.js';
import {
  decryptString,
  encryptString,
} from '../../infrastructure/security/encryption.js';

const ExecuteCommandBodySchema = z.object({
  command: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  triggerSource: TriggerSourceSchema.default('DASHBOARD'),
  bypassCache: z.boolean().default(false),
  requireApproval: z.boolean().optional(),
});

const StartWorkflowBodySchema = z.object({
  name: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  async: z.boolean().default(false),
});

const RuleGroupBodySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  logicalOperator: z.enum(['AND', 'OR']).default('AND'),
  conditions: z
    .array(
      z.object({
        field: z.string().min(1),
        operator: z.enum([
          'GREATER_THAN_OR_EQUAL',
          'LESS_THAN_OR_EQUAL',
          'EQUALS',
          'NOT_EQUALS',
          'CONTAINS_ANY',
          'CONTAINS_ALL',
          'EXCLUDES',
        ]),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
      }),
    )
    .default([]),
});

const DecisionBodySchema = z.object({
  data: z.record(z.unknown()),
  policy: z.object({
    id: z.string(),
    name: z.string(),
    ruleGroup: z.object({
      id: z.string(),
      name: z.string(),
      logicalOperator: z.enum(['AND', 'OR']),
      conditions: z.array(
        z.object({
          field: z.string(),
          operator: z.enum([
            'GREATER_THAN_OR_EQUAL',
            'LESS_THAN_OR_EQUAL',
            'EQUALS',
            'NOT_EQUALS',
            'CONTAINS_ANY',
            'CONTAINS_ALL',
            'EXCLUDES',
          ]),
          value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
        }),
      ),
    }),
    onMatch: z.object({
      type: z.enum(['DISPATCH_COMMAND', 'TRIGGER_APPROVAL', 'SKIP', 'NOTIFY']),
      command: z.string().optional(),
      message: z.string().optional(),
    }),
    onMiss: z.object({
      type: z.enum(['DISPATCH_COMMAND', 'TRIGGER_APPROVAL', 'SKIP', 'NOTIFY']),
      command: z.string().optional(),
      message: z.string().optional(),
    }),
  }),
});

export function createApiRouter(deps: {
  config: SystemConfig;
  database: DatabaseService;
  cache: CacheService;
  commandRouter: CommandRouter;
  workflowRuntime: WorkflowRuntime;
  approvalService: ApprovalService;
  tenantService: TenantService;
  metrics: MetricsService;
  tracing: TracingService;
  plugins: PluginLoader;
  connectors: ConnectorRegistry;
  decisionEngine: DecisionEngine;
  workflowVersions: VersionRegistry<WorkflowDefinition>;
  storage: IStorageService;
  notifications: INotificationService;
}): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware(deps.config);
  const db = () => deps.database.getDb();

  router.get('/health', async (_req, res) => {
    const databaseOk = await deps.database.healthCheck().catch(() => false);
    const cacheOk = await deps.cache.healthCheck().catch(() => false);
    res.status(databaseOk ? 200 : 503).json({
      status: databaseOk ? 'ok' : 'degraded',
      version: '0.1.0',
      checks: {
        database: databaseOk ? 'up' : 'down',
        cache: cacheOk ? 'up' : 'down',
      },
    });
  });

  router.get('/openapi.json', (_req, res) => {
    const openapiPath = path.resolve('public/openapi.json');
    res.type('application/json').send(fs.readFileSync(openapiPath, 'utf8'));
  });

  router.get('/metrics', requireAuth, (_req, res) => {
    res.json({
      metrics: deps.metrics.snapshot(),
      traces: deps.tracing.recent(20),
    });
  });

  router.get('/plugins', requireAuth, (_req, res) => {
    res.json({ plugins: deps.plugins.list() });
  });

  router.get('/connectors', requireAuth, (_req, res) => {
    res.json({ connectors: deps.connectors.list() });
  });

  router.post('/connectors/:id/test', requireAuth, async (req, res) => {
    const connector = deps.connectors.get(String(req.params.id));
    if (!connector) {
      res.status(404).json({ error: 'UNKNOWN_CONNECTOR' });
      return;
    }
    res.json(await connector.testConnection());
  });

  router.post('/decision/evaluate', requireAuth, async (req, res) => {
    const parsed = DecisionBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.message });
      return;
    }
    const execute = req.body?.execute !== false;
    const userId = req.user?.userId ?? 'local-user';
    if (!execute) {
      res.json(deps.decisionEngine.decide(parsed.data.data, parsed.data.policy));
      return;
    }
    const result = await deps.decisionEngine.decideAndExecute(
      parsed.data.data,
      parsed.data.policy,
      {
        userId,
        storage: deps.storage,
        approvalService: deps.approvalService,
        notifications: deps.notifications,
        runCommand: (directive) => deps.commandRouter.route(directive),
        ...(deps.config.integrations.slackWebhookUrl
          ? { slackWebhookUrl: deps.config.integrations.slackWebhookUrl }
          : {}),
      },
    );
    res.json(result);
  });

  router.get('/versions/workflows', requireAuth, (_req, res) => {
    res.json({
      workflows: deps.workflowVersions.list().map((w) => ({
        name: w.name,
        version: w.version,
        schemaVersion: w.schemaVersion,
        isDeprecated: w.isDeprecated ?? false,
      })),
    });
  });

  router.post('/auth/dev-token', (req, res) => {
    if (deps.config.app.env !== 'development') {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    const userId =
      typeof req.body?.userId === 'string' && req.body.userId.length > 0
        ? req.body.userId
        : 'local-user';
    const roleRaw = typeof req.body?.role === 'string' ? req.body.role : 'owner';
    const role =
      roleRaw === 'admin' || roleRaw === 'member' || roleRaw === 'viewer'
        ? roleRaw
        : 'owner';
    res.json({ token: createDevToken(deps.config, userId, role), userId, role });
  });

  router.post('/crypto/encrypt', requireAuth, (req, res) => {
    const plaintext = typeof req.body?.plaintext === 'string' ? req.body.plaintext : '';
    if (!plaintext) {
      res.status(400).json({ error: 'plaintext required' });
      return;
    }
    res.json({ ciphertext: encryptString(plaintext, deps.config.auth.encryptionKey) });
  });

  router.post('/crypto/decrypt', requireAuth, (req, res) => {
    const ciphertext = typeof req.body?.ciphertext === 'string' ? req.body.ciphertext : '';
    if (!ciphertext) {
      res.status(400).json({ error: 'ciphertext required' });
      return;
    }
    try {
      res.json({ plaintext: decryptString(ciphertext, deps.config.auth.encryptionKey) });
    } catch (error: unknown) {
      res.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get('/commands', requireAuth, (_req, res) => {
    res.json({ commands: deps.commandRouter.listCommands() });
  });

  router.post('/command', requireAuth, async (req, res) => {
    const parsed = ExecuteCommandBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.message });
      return;
    }
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    if (!canExecuteCommand(req.user?.role, parsed.data.command)) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Role cannot execute this command' });
      return;
    }

    const transactionId = req.transactionId ?? randomUUID();
    const spanId = deps.tracing.start('command.execute', {
      command: parsed.data.command,
      transactionId,
    });
    const started = Date.now();
    deps.metrics.incr('commands.total');

    const needsApproval =
      parsed.data.requireApproval === true ||
      deps.approvalService.requiresApproval(parsed.data.command);

    if (needsApproval) {
      const approval = await deps.approvalService.requestApproval({
        command: parsed.data.command,
        payload: parsed.data.payload,
        userId,
        transactionId,
      });
      deps.metrics.incr('commands.pending_approval');
      deps.tracing.end(spanId, { status: 'PENDING_REVIEW' });
      res.status(202).json({
        status: 'PENDING_REVIEW',
        approval,
        message: 'Command intercepted by Approval Engine',
      });
      return;
    }

    const directive: SystemCommandDirective = {
      transactionId,
      command: parsed.data.command,
      timestamp: new Date().toISOString(),
      payload: parsed.data.payload,
      context: {
        userId,
        triggerSource: parsed.data.triggerSource,
        bypassCache: parsed.data.bypassCache,
      },
    };

    try {
      const result = await deps.commandRouter.route(directive);
      deps.metrics.timing('commands.duration_ms', Date.now() - started);
      deps.metrics.incr('commands.completed');
      deps.tracing.end(spanId, { status: 'COMPLETED' });
      res.status(200).json({
        transactionId,
        command: directive.command,
        status: 'COMPLETED',
        result,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes('not a valid endpoint')
        ? 404
        : message.includes('Invalid command payload')
          ? 400
          : 500;
      deps.metrics.incr('commands.failed');
      deps.tracing.end(spanId, { status: 'FAILED', error: message });
      res.status(statusCode).json({
        transactionId,
        command: directive.command,
        status: 'FAILED',
        error: message,
      });
    }
  });

  router.get('/workflows', requireAuth, (_req, res) => {
    res.json({ workflows: deps.workflowRuntime.list() });
  });

  router.post('/workflows', requireAuth, async (req, res) => {
    const parsed = StartWorkflowBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.message });
      return;
    }
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    try {
      const startInput: {
        name: string;
        userId: string;
        payload: Record<string, unknown>;
        transactionId?: string;
        async?: boolean;
      } = {
        name: parsed.data.name,
        userId,
        payload: parsed.data.payload,
        async: parsed.data.async,
      };
      if (req.transactionId) startInput.transactionId = req.transactionId;

      const result = await deps.workflowRuntime.start(startInput);
      const workflow = await deps.workflowRuntime.get(result.workflowId);
      res.status(parsed.data.async ? 202 : 201).json({
        workflowId: result.workflowId,
        status: result.status,
        workflow,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(message.includes('Unknown workflow') ? 404 : 500).json({ error: message });
    }
  });

  router.get('/workflows/:id', requireAuth, async (req, res) => {
    const workflow = await deps.workflowRuntime.get(String(req.params.id));
    if (!workflow) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    res.json({ workflow });
  });

  router.post('/workflows/:id/resume', requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }
    try {
      const result = await deps.workflowRuntime.resume(String(req.params.id), userId);
      const workflow = await deps.workflowRuntime.get(String(req.params.id));
      res.json({ status: result.status, workflow });
    } catch (error: unknown) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.post('/workflows/:id/cancel', requireAuth, async (req, res) => {
    try {
      await deps.workflowRuntime.cancel(String(req.params.id));
      res.json({ status: 'CANCELLED' });
    } catch (error: unknown) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/approvals', requireAuth, async (_req, res) => {
    res.json({ approvals: await deps.approvalService.listPending() });
  });

  router.post('/approvals/:id/resolve', requireAuth, async (req, res) => {
    const decision = req.body?.decision === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    try {
      const approval = await deps.approvalService.resolve(
        String(req.params.id),
        decision,
        typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      );

      if (decision === 'APPROVED') {
        const userId = req.user?.userId ?? String(approval.userId);
        const directive: SystemCommandDirective = {
          transactionId: randomUUID(),
          command: String(approval.command),
          timestamp: new Date().toISOString(),
          payload: (approval.payload as Record<string, unknown>) ?? {},
          context: {
            userId,
            triggerSource: 'DASHBOARD',
            bypassCache: false,
          },
        };
        const result = await deps.commandRouter.route(directive);
        res.json({ approval, execution: { status: 'COMPLETED', result } });
        return;
      }

      res.json({ approval });
    } catch (error: unknown) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/rules', requireAuth, async (_req, res) => {
    const groups = await db().collection('rule_groups').find({}).toArray();
    const conditions = await db().collection('rule_conditions').find({}).toArray();
    res.json({
      rules: groups.map((g) => ({
        ...g,
        conditions: conditions.filter((c) => c.rule_group_id === g.id),
      })),
    });
  });

  router.post('/rules', requireAuth, async (req, res) => {
    const parsed = RuleGroupBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: parsed.error.message });
      return;
    }

    const id = parsed.data.id ?? randomUUID();
    const now = new Date().toISOString();
    await db().collection('rule_groups').updateOne(
      { id },
      {
        $set: {
          id,
          name: parsed.data.name,
          logical_operator: parsed.data.logicalOperator,
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );

    await db().collection('rule_conditions').deleteMany({ rule_group_id: id });
    if (parsed.data.conditions.length > 0) {
      await db().collection('rule_conditions').insertMany(
        parsed.data.conditions.map((c) => ({
          rule_group_id: id,
          field: c.field,
          operator: c.operator,
          value: JSON.stringify(c.value),
          created_at: now,
        })),
      );
    }

    res.status(201).json({ id, name: parsed.data.name });
  });

  router.get('/dashboard/summary', requireAuth, async (_req, res) => {
    res.json({
      commands: deps.commandRouter.listCommands(),
      workflows: deps.workflowRuntime.list(),
      approvals: await deps.approvalService.listPending(),
      rules: await db().collection('rule_groups').countDocuments(),
      tenants: await deps.tenantService.listTenants(),
      widgets: DEFAULT_DESKTOP_WIDGETS,
      plugins: deps.plugins.list(),
      connectors: deps.connectors.list(),
      metrics: deps.metrics.snapshot(),
    });
  });

  router.get('/tenants', requireAuth, async (_req, res) => {
    res.json({ tenants: await deps.tenantService.listTenants() });
  });

  router.post('/tenants', requireAuth, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const slug = typeof req.body?.slug === 'string' ? req.body.slug : '';
    if (!name || !slug) {
      res.status(400).json({ error: 'name and slug required' });
      return;
    }
    const tenant = await deps.tenantService.createTenant(name, slug);
    res.status(201).json({ tenant });
  });

  router.get('/tenants/:tenantId/users', requireAuth, async (req, res) => {
    res.json({
      users: await deps.tenantService.listUsers(String(req.params.tenantId)),
    });
  });

  router.post('/tenants/:tenantId/users', requireAuth, async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    const displayName =
      typeof req.body?.displayName === 'string' ? req.body.displayName : email;
    if (!email) {
      res.status(400).json({ error: 'email required' });
      return;
    }
    const user = await deps.tenantService.upsertUser({
      tenantId: String(req.params.tenantId),
      email,
      displayName,
      role: req.body?.role === 'admin' || req.body?.role === 'owner' ? req.body.role : 'member',
    });
    res.status(201).json({ user });
  });

  router.get('/widgets', requireAuth, (_req, res) => {
    res.json({ widgets: DEFAULT_DESKTOP_WIDGETS });
  });

  router.get('/widgets/:id/data', requireAuth, async (req, res) => {
    const id = String(req.params.id);
    if (id === 'status') {
      const databaseOk = await deps.database.healthCheck().catch(() => false);
      const cacheOk = await deps.cache.healthCheck().catch(() => false);
      res.json({ database: databaseOk, cache: cacheOk });
      return;
    }
    if (id === 'commands') {
      res.json({ commands: deps.commandRouter.listCommands() });
      return;
    }
    if (id === 'approvals') {
      res.json({ approvals: await deps.approvalService.listPending() });
      return;
    }
    if (id === 'workflows') {
      res.json({ workflows: deps.workflowRuntime.list() });
      return;
    }
    res.status(404).json({ error: 'UNKNOWN_WIDGET' });
  });

  return router;
}
