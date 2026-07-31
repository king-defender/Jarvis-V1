import type { ModelRouterService } from '../ai/model-router.service.js';

export interface PromptTemplate {
  id: string;
  system: string;
  userTemplate: string;
}

const PROMPTS: Record<string, PromptTemplate> = {
  'career.resume-optimize': {
    id: 'career.resume-optimize',
    system: 'You are an ATS resume coach. Return concrete bullet rewrites.',
    userTemplate:
      'Optimize this resume for the job.\n\nRESUME:\n{{resume}}\n\nJOB:\n{{job}}\n\nReturn 3 suggested bullet rewrites as plain text.',
  },
  'career.cover-letter': {
    id: 'career.cover-letter',
    system: 'You write concise professional cover letters.',
    userTemplate:
      'Write a {{tone}} cover letter for {{title}} at {{company}}.\n\nResume highlights:\n{{resume}}\n\nJob description:\n{{job}}',
  },
  'career.interview': {
    id: 'career.interview',
    system: 'You are an interview coach. Prefer STAR-method answers.',
    userTemplate:
      'Generate {{count}} interview questions with STAR ideal answers for this candidate.\n\nResume:\n{{resume}}\n\nJob:\n{{job}}\n\nKeywords: {{keywords}}',
  },
  'development.pr-review': {
    id: 'development.pr-review',
    system: 'You are a senior code reviewer. Be specific and actionable.',
    userTemplate: 'Review this pull request diff:\n\n{{diff}}',
  },
  'startup.competitor': {
    id: 'startup.competitor',
    system: 'You analyze competitor websites for product strategy.',
    userTemplate:
      'Company: {{company}}\nURL: {{url}}\nPage text:\n{{text}}\n\nExtract pricing signals and key features as bullet lists.',
  },
};

export class PromptLibrary {
  get(id: string): PromptTemplate {
    const prompt = PROMPTS[id];
    if (!prompt) throw new Error(`Unknown prompt template: ${id}`);
    return prompt;
  }

  render(id: string, vars: Record<string, string>): { system: string; prompt: string } {
    const template = this.get(id);
    let user = template.userTemplate;
    for (const [key, value] of Object.entries(vars)) {
      user = user.replaceAll(`{{${key}}}`, value);
    }
    return { system: template.system, prompt: user };
  }

  list(): string[] {
    return Object.keys(PROMPTS);
  }
}

export class SafetyService {
  private readonly blocked = [
    /\bignore (all|previous) instructions\b/i,
    /\bexfiltrat(e|ion)\b/i,
    /\bweaponize\b/i,
    /\bssn\b.*\d{3}-\d{2}-\d{4}/i,
  ];

  assertSafePrompt(text: string): void {
    for (const pattern of this.blocked) {
      if (pattern.test(text)) {
        throw new Error('SAFETY_BLOCKED: prompt failed safety policy');
      }
    }
  }

  sanitizeOutput(text: string): string {
    return text
      .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_KEY]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
      .trim();
  }
}

export class EvaluationService {
  constructor(private readonly modelRouter: ModelRouterService) {}

  async scoreRelevance(input: {
    expected: string;
    actual: string;
  }): Promise<{ score: number; notes: string; degraded: boolean }> {
    const overlap = this.tokenOverlap(input.expected, input.actual);
    try {
      const ai = await this.modelRouter.complete({
        systemPrompt: 'Score answer relevance 0-100. Reply with SCORE:<n> NOTES:<text>',
        prompt: `Expected themes:\n${input.expected}\n\nActual:\n${input.actual}`,
        maxTokens: 200,
      });
      const scoreMatch = ai.text.match(/SCORE:\s*(\d+)/i);
      const notesMatch = ai.text.match(/NOTES:\s*(.+)/i);
      return {
        score: scoreMatch ? Number(scoreMatch[1]) : overlap,
        notes: notesMatch?.[1]?.trim() ?? ai.text.slice(0, 200),
        degraded: ai.degraded,
      };
    } catch {
      return { score: overlap, notes: 'Heuristic overlap score', degraded: true };
    }
  }

  private tokenOverlap(a: string, b: string): number {
    const ta = new Set(a.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []);
    const tb = new Set(b.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? []);
    if (ta.size === 0) return 0;
    let hits = 0;
    for (const t of ta) if (tb.has(t)) hits += 1;
    return Math.round((hits / ta.size) * 100);
  }
}
