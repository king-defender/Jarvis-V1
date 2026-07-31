import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { IGitHubService } from '../../../infrastructure/services/github.service.js';
import type { IStorageService } from '../../../infrastructure/services/storage.service.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../../infrastructure/services/event-bus.service.js';
import { gitCloneTask } from '../../tasks/index.js';
import { githubReviewSkill } from '../../skills/index.js';
import type { ModelRouterService } from '../../../infrastructure/ai/model-router.service.js';
import type {
  PromptLibrary,
  SafetyService,
} from '../../../infrastructure/ai/prompt-safety-eval.js';
import type { CommandRegistration } from '../../../shared/types/command.types.js';

const BoilerplateSchema = z.object({
  templateType: z.enum(['nextjs', 'vite', 'sqlite']),
  outputPath: z.string().min(1),
});

const ReviewPrSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  prNumber: z.coerce.number().int().positive(),
});

const AuditRepoSchema = z.object({
  repoPath: z.string().min(1),
});

const CloneRepoSchema = z.object({
  repoUrl: z.string().url(),
  folderName: z.string().min(1).default('cloned-repo'),
  branchName: z.string().optional(),
});

const SECRET_PATTERNS = [
  { severity: 'high', description: 'AWS access key pattern', regex: /AKIA[0-9A-Z]{16}/g },
  { severity: 'high', description: 'Generic API key assignment', regex: /api[_-]?key\s*=\s*['\"][^'\"]{8,}/gi },
  { severity: 'medium', description: 'Private key block', regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g },
];

export function getDevelopmentCommandRegistrations(deps: {
  storage: IStorageService;
  github: IGitHubService;
  eventBus: ISystemEventBus;
  baseDataPath: string;
  modelRouter: ModelRouterService;
  prompts: PromptLibrary;
  safety: SafetyService;
}): CommandRegistration[] {
  return [
    {
      command: 'development.generate-boilerplate',
      schema: BoilerplateSchema,
      handler: async (payload: z.infer<typeof BoilerplateSchema>) => {
        const started = Date.now();
        const root = path.resolve(deps.baseDataPath, payload.outputPath);
        await fs.mkdir(root, { recursive: true });
        const files: Array<{ rel: string; body: string }> = [];

        if (payload.templateType === 'vite') {
          files.push(
            { rel: 'package.json', body: JSON.stringify({ name: 'app', private: true, type: 'module' }, null, 2) },
            { rel: 'index.html', body: '<!doctype html><html><body><div id="root"></div></body></html>\n' },
            { rel: 'src/main.ts', body: 'console.log("vite app");\n' },
          );
        } else if (payload.templateType === 'nextjs') {
          files.push(
            { rel: 'package.json', body: JSON.stringify({ name: 'next-app', private: true }, null, 2) },
            { rel: 'app/page.tsx', body: 'export default function Page(){ return <main>Hello</main>; }\n' },
          );
        } else {
          files.push(
            { rel: 'schema.sql', body: 'CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, name TEXT NOT NULL);\n' },
            { rel: 'README.md', body: '# SQLite starter\n' },
          );
        }

        const filesCreated: string[] = [];
        for (const file of files) {
          const full = path.join(root, file.rel);
          await fs.mkdir(path.dirname(full), { recursive: true });
          await fs.writeFile(full, file.body, 'utf8');
          filesCreated.push(full);
        }

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'development.boilerplate_generated',
            payload: { templateType: payload.templateType, filesCreated },
            producer: 'DevelopmentModule',
          }),
        );

        return { filesCreated, durationMs: Date.now() - started };
      },
    },
    {
      command: 'development.review-pr',
      schema: ReviewPrSchema,
      handler: async (payload: z.infer<typeof ReviewPrSchema>) => {
        let diff = '';
        try {
          diff = await deps.github.getPullRequestDiff(
            payload.owner,
            payload.repo,
            payload.prNumber,
          );
        } catch {
          diff = '';
        }

        const review = await githubReviewSkill({
          diff,
          modelRouter: deps.modelRouter,
          prompts: deps.prompts,
          safety: deps.safety,
        });

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'development.pr_reviewed',
            payload: { status: review.status, owner: payload.owner, repo: payload.repo },
            producer: 'DevelopmentModule',
          }),
        );

        return review;
      },
    },
    {
      command: 'development.audit-repo',
      schema: AuditRepoSchema,
      handler: async (payload: z.infer<typeof AuditRepoSchema>) => {
        const root = path.resolve(payload.repoPath);
        const vulnerabilities: Array<{ severity: string; description: string; file?: string }> = [];

        async function walk(dir: string): Promise<void> {
          let entries: string[] = [];
          try {
            entries = await fs.readdir(dir);
          } catch {
            return;
          }
          for (const entry of entries) {
            if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
            const full = path.join(dir, entry);
            const stat = await fs.stat(full);
            if (stat.isDirectory()) {
              await walk(full);
              continue;
            }
            if (!/\.(ts|js|env|json|md|yml|yaml)$/i.test(entry)) continue;
            const content = await fs.readFile(full, 'utf8');
            for (const pattern of SECRET_PATTERNS) {
              if (pattern.regex.test(content)) {
                vulnerabilities.push({
                  severity: pattern.severity,
                  description: pattern.description,
                  file: full,
                });
              }
              pattern.regex.lastIndex = 0;
            }
          }
        }

        await walk(root);
        const healthScore = Math.max(0, 100 - vulnerabilities.length * 15);
        const now = new Date().toISOString();
        await deps.storage.collection('repositories_audit').updateOne(
          { repo_path: root },
          {
            $set: {
              repo_path: root,
              last_audit_at: now,
              vulnerabilities_json: vulnerabilities,
              health_score: healthScore,
              updated_at: now,
            },
          },
          { upsert: true },
        );

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'development.repo_audited',
            payload: { issuesCount: vulnerabilities.length, healthScore },
            producer: 'DevelopmentModule',
          }),
        );

        return { issuesCount: vulnerabilities.length, vulnerabilities, healthScore };
      },
    },
    {
      command: 'development.clone-repo',
      schema: CloneRepoSchema,
      handler: async (payload: z.infer<typeof CloneRepoSchema>) => {
        const targetPath = path.resolve(deps.baseDataPath, 'repos', payload.folderName);
        const cloneInput: {
          repoUrl: string;
          targetPath: string;
          branchName?: string;
        } = {
          repoUrl: payload.repoUrl,
          targetPath,
        };
        if (payload.branchName) cloneInput.branchName = payload.branchName;
        const result = await gitCloneTask(cloneInput);
        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'development.repo_cloned',
            payload: { path: result.path, commitHash: result.commitHash },
            producer: 'DevelopmentModule',
          }),
        );
        return result;
      },
    },
  ];
}
