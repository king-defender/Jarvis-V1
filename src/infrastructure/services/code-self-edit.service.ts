import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IStorageService } from './storage.service.js';
import type { ModelRouterService } from '../ai/model-router.service.js';

const ALLOWED_PREFIXES = ['src/', 'web/src/', 'docs/', 'scripts/', 'public/widgets/'];
const ALLOWED_ROOT_FILES = new Set([
  'README.md',
  'PERSONAL_SETUP.md',
  'FROZEN.md',
  '.env.example',
  'start.ps1',
  'start.bat',
]);
const DENY_NAMES = new Set(['.env', '.env.local', 'package-lock.json']);

export type CodeChangeProposal = {
  id: string;
  path: string;
  mode: 'write' | 'replace';
  content?: string;
  oldString?: string;
  newString?: string;
  rationale: string;
  status: 'proposed' | 'applied' | 'rejected' | 'failed';
  userId: string;
  createdAt: string;
  appliedAt?: string;
  error?: string;
};

/**
 * Sandboxed self-edit of the local project tree.
 * Never touches .env, node_modules, .git, or paths outside the project root.
 */
export class CodeSelfEditService {
  constructor(
    private readonly projectRoot: string,
    private readonly storage: IStorageService,
    private readonly modelRouter: ModelRouterService,
  ) {}

  resolveSafeRelative(relPath: string): string {
    const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.includes('\0') || normalized.split('/').includes('..')) {
      throw new Error(`Path not allowed: ${relPath}`);
    }
    const base = path.basename(normalized);
    if (DENY_NAMES.has(base) || normalized.startsWith('.git/') || normalized.startsWith('node_modules/')) {
      throw new Error(`Path denied: ${relPath}`);
    }
    const allowed =
      ALLOWED_ROOT_FILES.has(normalized) ||
      ALLOWED_PREFIXES.some((p) => normalized.startsWith(p));
    if (!allowed) {
      throw new Error(
        `Path outside self-edit allowlist: ${relPath}. Allowed: src/, web/src/, docs/, scripts/, and a few root docs.`,
      );
    }
    const full = path.resolve(this.projectRoot, normalized);
    const root = path.resolve(this.projectRoot);
    const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (full !== root && !full.startsWith(rootWithSep)) {
      throw new Error(`Path escapes project root: ${relPath}`);
    }
    return full;
  }

  async proposeFromInstruction(input: {
    userId: string;
    instruction: string;
    pathHint?: string;
  }): Promise<CodeChangeProposal> {
    const recent = await this.storage
      .collection('assistant_interactions')
      .find({ user_id: input.userId })
      .sort({ created_at: -1 })
      .limit(8)
      .toArray();

    const ai = await this.modelRouter.complete({
      systemPrompt:
        'You propose a single local file edit for Jarvis-V1. Return ONLY JSON with keys: ' +
        'path (string), mode ("write"|"replace"), content (for write), oldString, newString (for replace), rationale. ' +
        'Prefer small replace edits. Paths must be under src/, web/src/, docs/, or scripts/.',
      prompt: [
        `Instruction: ${input.instruction}`,
        input.pathHint ? `Path hint: ${input.pathHint}` : '',
        'Recent interactions:',
        ...recent.map((r) => `- ${String(r.summary ?? r.utterance ?? '')}`),
      ]
        .filter(Boolean)
        .join('\n'),
      maxTokens: 2048,
    });

    const parsed = extractJson(ai.text);
    const relPath = String(parsed.path || input.pathHint || 'docs/self-notes.md');
    this.resolveSafeRelative(relPath);

    const mode = parsed.mode === 'replace' ? 'replace' : 'write';
    const now = new Date().toISOString();
    const proposal: CodeChangeProposal = {
      id: randomUUID(),
      path: relPath.replace(/\\/g, '/'),
      mode,
      rationale: String(parsed.rationale || input.instruction).slice(0, 2000),
      status: 'proposed',
      userId: input.userId,
      createdAt: now,
    };
    if (mode === 'write') {
      proposal.content = String(parsed.content ?? `# Note\n\n${input.instruction}\n`);
    } else {
      proposal.oldString = String(parsed.oldString ?? '');
      proposal.newString = String(parsed.newString ?? '');
    }

    await this.storage.collection('code_change_proposals').insertOne({
      ...proposal,
      user_id: input.userId,
      created_at: now,
      updated_at: now,
    });
    return proposal;
  }

  async applyProposal(proposalId: string): Promise<CodeChangeProposal> {
    const doc = await this.storage.collection('code_change_proposals').findOne({ id: proposalId });
    if (!doc) throw new Error(`Proposal not found: ${proposalId}`);
    if (doc.status === 'applied') {
      return this.toProposal(doc);
    }

    const relPath = String(doc.path);
    const full = this.resolveSafeRelative(relPath);
    const mode = doc.mode === 'replace' ? 'replace' : 'write';
    const now = new Date().toISOString();

    try {
      await fs.mkdir(path.dirname(full), { recursive: true });
      if (mode === 'write') {
        await fs.writeFile(full, String(doc.content ?? ''), 'utf8');
      } else {
        const current = await fs.readFile(full, 'utf8');
        const oldString = String(doc.oldString ?? '');
        const newString = String(doc.newString ?? '');
        if (!oldString || !current.includes(oldString)) {
          throw new Error('oldString not found in file — proposal stale');
        }
        await fs.writeFile(full, current.replace(oldString, newString), 'utf8');
      }
      await this.storage.collection('code_change_proposals').updateOne(
        { id: proposalId },
        { $set: { status: 'applied', applied_at: now, updated_at: now, error: null } },
      );
      return {
        ...this.toProposal(doc),
        status: 'applied',
        appliedAt: now,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.storage.collection('code_change_proposals').updateOne(
        { id: proposalId },
        { $set: { status: 'failed', error: message, updated_at: now } },
      );
      throw error;
    }
  }

  async proposeAndApply(input: {
    userId: string;
    instruction: string;
    pathHint?: string;
  }): Promise<{ proposal: CodeChangeProposal; applied: boolean }> {
    const proposal = await this.proposeFromInstruction(input);
    const applied = await this.applyProposal(proposal.id);
    return { proposal: applied, applied: true };
  }

  private toProposal(doc: Record<string, unknown>): CodeChangeProposal {
    const proposal: CodeChangeProposal = {
      id: String(doc.id),
      path: String(doc.path),
      mode: doc.mode === 'replace' ? 'replace' : 'write',
      rationale: String(doc.rationale ?? ''),
      status: (doc.status as CodeChangeProposal['status']) ?? 'proposed',
      userId: String(doc.user_id ?? doc.userId ?? ''),
      createdAt: String(doc.created_at ?? doc.createdAt ?? ''),
    };
    if (doc.content != null) proposal.content = String(doc.content);
    if (doc.oldString != null) proposal.oldString = String(doc.oldString);
    if (doc.newString != null) proposal.newString = String(doc.newString);
    if (doc.applied_at != null) proposal.appliedAt = String(doc.applied_at);
    if (doc.error != null) proposal.error = String(doc.error);
    return proposal;
  }
}

function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/\{[\s\S]*\}/);
  if (!fenced) {
    return {
      path: 'docs/self-notes.md',
      mode: 'write',
      content: `# Self note\n\n${text.slice(0, 4000)}\n`,
      rationale: 'Fallback note write — model did not return JSON',
    };
  }
  try {
    return JSON.parse(fenced[0]!) as Record<string, unknown>;
  } catch {
    return {
      path: 'docs/self-notes.md',
      mode: 'write',
      content: `# Self note\n\n${text.slice(0, 4000)}\n`,
      rationale: 'Fallback note write — invalid JSON from model',
    };
  }
}
