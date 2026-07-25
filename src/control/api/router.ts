import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { CacheService } from '../../infrastructure/cache/redis.service.js';
import type { DatabaseService } from '../../infrastructure/database/connection.service.js';
import type { SystemConfig } from '../../config.js';
import type { WorkflowRuntime } from '../../orchestration/workflow/workflow.runtime.js';
import { createAuthMiddleware, createDevToken } from '../auth/auth.middleware.js';
import type { CommandRouter } from '../command-engine/command.router.js';
import {
  TriggerSourceSchema,
  type SystemCommandDirective,
} from '../../shared/types/command.types.js';

const ExecuteCommandBodySchema = z.object({
  command: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  triggerSource: TriggerSourceSchema.default('DASHBOARD'),
  bypassCache: z.boolean().default(false),
});

const StartWorkflowBodySchema = z.object({
  name: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});

export function createApiRouter(deps: {
  config: SystemConfig;
  database: DatabaseService;
  cache: CacheService;
  commandRouter: CommandRouter;
  workflowRuntime: WorkflowRuntime;
}): Router {
  const router = Router();
  const requireAuth = createAuthMiddleware(deps.config);

  router.get('/health', async (_req, res) => {
    const databaseOk = await deps.database.healthCheck().catch(() => false);
    const cacheOk = await deps.cache.healthCheck().catch(() => false);

    const status = databaseOk ? 'ok' : 'degraded';
    res.status(databaseOk ? 200 : 503).json({
      status,
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

    res.json({
      token: createDevToken(deps.config, userId),
      userId,
    });
  });

  router.get('/commands', requireAuth, (_req, res) => {
    res.json({
      commands: deps.commandRouter.listCommands(),
    });
  });

  router.post('/command', requireAuth, async (req, res) => {
    const parsed = ExecuteCommandBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.message,
      });
      return;
    }

    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const transactionId = req.transactionId ?? randomUUID();
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
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.message,
      });
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
      } = {
        name: parsed.data.name,
        userId,
        payload: parsed.data.payload,
      };
      if (req.transactionId) {
        startInput.transactionId = req.transactionId;
      }

      const result = await deps.workflowRuntime.start(startInput);
      const workflow = await deps.workflowRuntime.get(result.workflowId);
      res.status(201).json({
        workflowId: result.workflowId,
        status: result.status,
        workflow,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes('Unknown workflow') ? 404 : 500;
      res.status(statusCode).json({ error: message });
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
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  router.post('/workflows/:id/cancel', requireAuth, async (req, res) => {
    try {
      await deps.workflowRuntime.cancel(String(req.params.id));
      res.json({ status: 'CANCELLED' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  return router;
}
