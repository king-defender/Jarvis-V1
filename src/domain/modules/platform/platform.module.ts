import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DecisionEngine, type DecisionPolicy } from '../../../evaluation/decision/decision-engine.js';
import type { ModelRouterService } from '../../../infrastructure/ai/model-router.service.js';
import type { ConnectorRegistry } from '../../../infrastructure/connectors/connector.js';
import type { IEmailService } from '../../../infrastructure/services/email.service.js';
import type { IFilesystemService } from '../../../infrastructure/services/filesystem.service.js';
import type { INotificationService } from '../../../infrastructure/services/notification.service.js';
import type { IStorageService } from '../../../infrastructure/services/storage.service.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../../infrastructure/services/event-bus.service.js';
import { classifyError, withRetry } from '../../../orchestration/recovery/recovery.js';
import {
  companyResearchSkill,
  deploymentSkill,
  documentationSkill,
  interviewSkill,
  pricingAnalysisSkill,
  prdGenerationSkill,
} from '../../skills/index.js';
import {
  extractKeywordsTask,
  gitCloneTask,
  matchResumeTask,
  ocrTask,
  parseHtmlTask,
  parsePdfFileTask,
  parsePdfTextTask,
  extractDomTask,
} from '../../tasks/index.js';
import type {
  PromptLibrary,
  SafetyService,
  EvaluationService,
} from '../../../infrastructure/ai/prompt-safety-eval.js';
import type { CommandRegistration } from '../../../shared/types/command.types.js';

const DecideSchema = z.object({
  data: z.record(z.unknown()),
  execute: z.boolean().default(true),
  policy: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
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
      channel: z.enum(['slack', 'email']).optional(),
    }),
    onMiss: z.object({
      type: z.enum(['DISPATCH_COMMAND', 'TRIGGER_APPROVAL', 'SKIP', 'NOTIFY']),
      command: z.string().optional(),
      message: z.string().optional(),
      channel: z.enum(['slack', 'email']).optional(),
    }),
  }),
});

export interface PlatformDeps {
  storage: IStorageService;
  filesystem: IFilesystemService;
  email: IEmailService;
  notifications: INotificationService;
  modelRouter: ModelRouterService;
  connectors: ConnectorRegistry;
  eventBus: ISystemEventBus;
  decisionEngine: DecisionEngine;
  approvalService: import('../../../orchestration/approval/approval.service.js').ApprovalService;
  runCommand: (directive: import('../../../shared/types/command.types.js').SystemCommandDirective) => Promise<unknown>;
  baseDataPath: string;
  prompts: PromptLibrary;
  safety: SafetyService;
  evaluation: EvaluationService;
  slackWebhookUrl?: string;
  execute?: boolean;
}

export function getPlatformCommandRegistrations(deps: PlatformDeps): CommandRegistration[] {
  return [
    {
      command: 'platform.decide',
      schema: DecideSchema,
      handler: async (payload: z.infer<typeof DecideSchema>, context) => {
        if (!payload.execute) {
          const result = deps.decisionEngine.decide(
            payload.data,
            payload.policy as DecisionPolicy,
          );
          return result;
        }
        return deps.decisionEngine.decideAndExecute(
          payload.data,
          payload.policy as DecisionPolicy,
          {
            userId: context.userId,
            storage: deps.storage,
            approvalService: deps.approvalService,
            notifications: deps.notifications,
            runCommand: deps.runCommand,
            ...(deps.slackWebhookUrl ? { slackWebhookUrl: deps.slackWebhookUrl } : {}),
          },
        );
      },
    },
    {
      command: 'platform.extract-keywords',
      schema: z.object({ text: z.string().min(1), limit: z.number().int().default(12) }),
      handler: async (payload: { text: string; limit: number }) => ({
        keywords: await extractKeywordsTask(payload.text, payload.limit),
      }),
    },
    {
      command: 'platform.match-resume',
      schema: z.object({
        resumeText: z.string().min(1),
        jobText: z.string().min(1),
      }),
      handler: async (payload: { resumeText: string; jobText: string }) =>
        matchResumeTask(payload.resumeText, payload.jobText),
    },
    {
      command: 'platform.parse-html',
      schema: z.object({ html: z.string().min(1) }),
      handler: async (payload: { html: string }) => parseHtmlTask(payload.html),
    },
    {
      command: 'platform.parse-pdf-text',
      schema: z.object({ raw: z.string().min(1) }),
      handler: async (payload: { raw: string }) => ({ text: parsePdfTextTask(payload.raw) }),
    },
    {
      command: 'platform.parse-pdf',
      schema: z.object({ filePath: z.string().min(1) }),
      handler: async (payload: { filePath: string }) => parsePdfFileTask(payload.filePath),
    },
    {
      command: 'platform.evaluate-output',
      schema: z.object({
        expected: z.string().min(1),
        actual: z.string().min(1),
      }),
      handler: async (payload: { expected: string; actual: string }) =>
        deps.evaluation.scoreRelevance(payload),
    },
    {
      command: 'platform.extract-dom',
      schema: z.object({
        html: z.string().min(1),
        selectorHint: z.string().optional(),
      }),
      handler: async (payload: { html: string; selectorHint?: string }) => ({
        nodes: extractDomTask(payload.html, payload.selectorHint),
      }),
    },
    {
      command: 'platform.ocr',
      schema: z.object({
        imagePath: z.string().min(1),
      }),
      handler: async (payload: { imagePath: string }) => ocrTask(payload.imagePath),
    },
    {
      command: 'platform.git-clone',
      schema: z.object({
        repoUrl: z.string().url(),
        targetPath: z.string().min(1),
        branchName: z.string().optional(),
      }),
      handler: async (payload: {
        repoUrl: string;
        targetPath: string;
        branchName?: string;
      }) => {
        const pathMod = await import('node:path');
        const safeRelative = payload.targetPath.replace(/^[/\\]+/, '');
        const target = pathMod.resolve(deps.baseDataPath, 'repos', safeRelative);
        if (!target.startsWith(pathMod.resolve(deps.baseDataPath))) {
          throw new Error('Clone path escapes data directory');
        }
        const cloneInput: {
          repoUrl: string;
          targetPath: string;
          branchName?: string;
        } = {
          repoUrl: payload.repoUrl,
          targetPath: target,
        };
        if (payload.branchName) cloneInput.branchName = payload.branchName;
        return gitCloneTask(cloneInput);
      },
    },
    {
      command: 'platform.fs-write',
      schema: z.object({
        path: z.string().min(1),
        content: z.string(),
      }),
      handler: async (payload: { path: string; content: string }) => {
        await deps.filesystem.writeFile(payload.path, payload.content);
        return { path: payload.path, written: true };
      },
    },
    {
      command: 'platform.fs-read',
      schema: z.object({ path: z.string().min(1) }),
      handler: async (payload: { path: string }) => ({
        path: payload.path,
        content: await deps.filesystem.readFile(payload.path),
      }),
    },
    {
      command: 'platform.send-email',
      schema: z.object({
        to: z.string().email(),
        subject: z.string().min(1),
        html: z.string().min(1),
      }),
      handler: async (payload: { to: string; subject: string; html: string }) => {
        const messageId = await withRetry(() =>
          deps.email.sendMail(payload.to, payload.subject, payload.html),
        );
        return { messageId, status: 'sent_or_queued' };
      },
    },
    {
      command: 'platform.notify',
      schema: z.object({
        title: z.string().min(1),
        message: z.string().min(1),
        channel: z.enum(['local', 'slack']).default('local'),
      }),
      handler: async (payload: {
        title: string;
        message: string;
        channel: 'local' | 'slack';
      }) => {
        if (payload.channel === 'slack') {
          if (!deps.slackWebhookUrl) {
            throw new Error('Slack webhook not configured');
          }
          await deps.notifications.dispatchSlackWebhook(
            deps.slackWebhookUrl,
            `${payload.title}: ${payload.message}`,
          );
        } else {
          deps.notifications.dispatchLocalAlert(payload.title, payload.message);
        }
        return { delivered: true, channel: payload.channel };
      },
    },
    {
      command: 'platform.research-company',
      schema: z.object({ companyName: z.string().min(1) }),
      handler: async (payload: { companyName: string }) =>
        companyResearchSkill({
          companyName: payload.companyName,
          modelRouter: deps.modelRouter,
        }),
    },
    {
      command: 'platform.generate-docs',
      schema: z.object({
        title: z.string().min(1),
        outline: z.array(z.string()).default([]),
      }),
      handler: async (payload: { title: string; outline: string[] }) =>
        documentationSkill({
          title: payload.title,
          outline: payload.outline,
          modelRouter: deps.modelRouter,
        }),
    },
    {
      command: 'platform.generate-prd',
      schema: z.object({
        productName: z.string().min(1),
        problem: z.string().min(1),
      }),
      handler: async (payload: { productName: string; problem: string }) =>
        prdGenerationSkill({
          productName: payload.productName,
          problem: payload.problem,
          modelRouter: deps.modelRouter,
        }),
    },
    {
      command: 'platform.deployment-plan',
      schema: z.object({
        environment: z.string().min(1),
        checklist: z.array(z.string()).default(['build', 'migrate', 'smoke-test']),
      }),
      handler: async (payload: { environment: string; checklist: string[] }) =>
        deploymentSkill(payload),
    },
    {
      command: 'platform.pricing-analysis',
      schema: z.object({
        plans: z.array(z.object({ name: z.string(), price: z.number() })).min(1),
      }),
      handler: async (payload: { plans: Array<{ name: string; price: number }> }) =>
        pricingAnalysisSkill(payload),
    },
    {
      command: 'platform.classify-error',
      schema: z.object({ message: z.string().min(1) }),
      handler: async (payload: { message: string }) => ({
        errorClass: classifyError(new Error(payload.message)),
      }),
    },
    {
      command: 'platform.connector-test',
      schema: z.object({ connectorId: z.string().min(1) }),
      handler: async (payload: { connectorId: string }) => {
        const connector = deps.connectors.get(payload.connectorId);
        if (!connector) throw new Error(`Unknown connector: ${payload.connectorId}`);
        return connector.testConnection();
      },
    },
    {
      command: 'career.prepare-interview',
      schema: z.object({
        resumeText: z.string().min(1),
        jobDescription: z.string().min(1),
        questionsCount: z.number().int().min(1).max(20).default(5),
      }),
      handler: async (
        payload: { resumeText: string; jobDescription: string; questionsCount: number },
        context,
      ) => {
        const result = await interviewSkill({
          resumeText: payload.resumeText,
          jobDescription: payload.jobDescription,
          questionsCount: payload.questionsCount,
          modelRouter: deps.modelRouter,
          prompts: deps.prompts,
          safety: deps.safety,
        });
        await deps.storage.collection('interview_prep').insertOne({
          id: randomUUID(),
          user_id: context.userId,
          ...result,
          created_at: new Date().toISOString(),
        });
        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'career.interview_prepared',
            payload: { questions: result.questions.length, matchScore: result.matchScore },
            producer: 'PlatformModule',
          }),
        );
        return result;
      },
    },
  ];
}
