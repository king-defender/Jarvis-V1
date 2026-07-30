import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { SystemConfig } from '../../config.js';
import type { CacheService } from '../../infrastructure/cache/redis.service.js';
import type { DatabaseService } from '../../infrastructure/database/connection.service.js';
import type { ApprovalService } from '../../orchestration/approval/approval.service.js';
import type { WorkflowRuntime } from '../../orchestration/workflow/workflow.runtime.js';
import {
  TriggerSourceSchema,
  type SystemCommandDirective,
} from '../../shared/types/command.types.js';
import { createAuthMiddleware, createDevToken } from '../auth/auth.middleware.js';
import type { CommandRouter } from '../command-engine/command.router.js';

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

export function createApiRouter(deps: {
  config: SystemConfig;
  database: DatabaseService;
  cache: CacheService;
  commandRouter: CommandRouter;
  workflowRuntime: WorkflowRuntime;
  approvalService: ApprovalService;
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

  router.post('/auth/dev-token', (req, res) => {
    if (deps.config.app.env !== 'development') {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    const userId =
      typeof req.body?.userId === 'string' && req.body.userId.length > 0
        ? req.body.userId
        : 'local-user';
    res.json({ token: createDevToken(deps.config, userId), userId });
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

    const transactionId = req.transactionId ?? randomUUID();
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
    });
  });

  return router;
}
