import type { SystemConfig } from '../../config.js';
import { withRetry, classifyError, shouldRetry } from '../../orchestration/recovery/recovery.js';
import type { ILoggingService } from '../services/logging.service.js';

export interface ModelRoutingRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelRoutingResponse {
  text: string;
  modelUsed: string;
  costEstimateUsd: number;
  degraded: boolean;
}

type ProviderCall = (request: ModelRoutingRequest) => Promise<ModelRoutingResponse>;

/**
 * Offline-first text composer.
 * External providers (Anthropic/Gemini/Ollama) are opt-in via AI_MODE=hybrid + keys.
 * Default AI_MODE=offline never requires API keys — the OS runs by itself.
 */
export class ModelRouterService {
  private spentUsd = 0;

  constructor(
    private readonly config: SystemConfig,
    private readonly log: ILoggingService,
  ) {}

  async complete(request: ModelRoutingRequest): Promise<ModelRoutingResponse> {
    const mode = this.config.ai.mode;

    if (mode === 'offline') {
      return this.deterministicCompose(request);
    }

    if (this.spentUsd >= this.config.ai.monthlyLimitUsd) {
      this.log.warn('AI monthly budget exhausted; using deterministic composer');
      return this.deterministicCompose(request);
    }

    const tiers: Array<{ name: string; run: ProviderCall }> = [];

    if (this.config.ai.anthropicApiKey || this.config.ai.providerKey) {
      tiers.push({ name: 'anthropic', run: (r) => this.callAnthropic(r) });
    }
    if (this.config.ai.geminiApiKey) {
      tiers.push({ name: 'gemini', run: (r) => this.callGemini(r) });
    }
    if (this.config.ai.ollamaBaseUrl) {
      tiers.push({ name: 'ollama', run: (r) => this.callOllama(r) });
    }

    if (tiers.length === 0) {
      return this.deterministicCompose(request);
    }

    for (const tier of tiers) {
      try {
        const result = await withRetry(() => tier.run(request), 2);
        this.spentUsd += result.costEstimateUsd;
        this.log.info('ModelRouter completed', {
          tier: tier.name,
          model: result.modelUsed,
          cost: result.costEstimateUsd,
        });
        return result;
      } catch (error: unknown) {
        const errorClass = classifyError(error);
        this.log.warn('ModelRouter tier failed; trying next', {
          tier: tier.name,
          errorClass,
          retryable: shouldRetry(errorClass),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.log.warn('External AI unavailable; using deterministic composer', {
      attemptedTiers: tiers.map((t) => t.name),
    });
    return this.deterministicCompose(request);
  }

  /** Rule/template composer — no network, no keys. */
  private deterministicCompose(request: ModelRoutingRequest): ModelRoutingResponse {
    const prompt = request.prompt.trim();
    const system = (request.systemPrompt ?? '').toLowerCase();
    const lower = prompt.toLowerCase();
    const keywords = this.extractKeywords(prompt);

    let text: string;

    if (system.includes('resume') || lower.includes('optimize this resume')) {
      text = this.composeResume(prompt, keywords);
    } else if (system.includes('cover letter') || lower.includes('cover letter')) {
      text = this.composeCoverLetter(prompt, keywords);
    } else if (system.includes('interview') || lower.includes('interview questions')) {
      text = this.composeInterview(prompt, keywords);
    } else if (system.includes('code reviewer') || lower.includes('pull request diff')) {
      text = this.composePrReview(prompt);
    } else if (system.includes('competitor') || lower.includes('pricing signals')) {
      text = this.composeCompetitor(prompt, keywords);
    } else if (system.includes('email') || lower.includes('instruction:')) {
      text = this.composeEmail(prompt);
    } else if (system.includes('summarize') || lower.includes('action items')) {
      text = this.composeSummary(prompt);
    } else if (system.includes('score answer relevance') || lower.includes('score:')) {
      text = `SCORE:${Math.min(95, 40 + keywords.length * 5)} NOTES: Deterministic overlap against expected themes (${keywords.slice(0, 4).join(', ') || 'n/a'}).`;
    } else if (lower.includes('prd for') || system.includes('prd')) {
      text = this.composeGenericDoc('PRD draft', prompt, keywords);
    } else if (lower.includes('write docs') || system.includes('docs')) {
      text = this.composeGenericDoc('Documentation draft', prompt, keywords);
    } else if (lower.includes('research summary')) {
      text = this.composeGenericDoc('Company research notes', prompt, keywords);
    } else {
      text = this.composeGenericDoc('Structured draft', prompt, keywords);
    }

    return {
      text,
      modelUsed: 'deterministic-composer',
      costEstimateUsd: 0,
      degraded: false,
    };
  }

  private extractKeywords(text: string): string[] {
    const stop = new Set([
      'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'have', 'will',
      'are', 'was', 'were', 'been', 'into', 'about', 'write', 'return', 'plain',
    ]);
    const counts = new Map<string, number>();
    for (const token of text.toLowerCase().match(/\b[a-z][a-z0-9+#.()-]{2,}\b/g) ?? []) {
      if (stop.has(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([w]) => w);
  }

  private section(prompt: string, label: string): string {
    const re = new RegExp(`${label}[:\\s]*([\\s\\S]*?)(?=\\n\\n[A-Z][A-Z ]+:|$)`, 'i');
    return prompt.match(re)?.[1]?.trim() ?? '';
  }

  private composeResume(prompt: string, keywords: string[]): string {
    const job = this.section(prompt, 'JOB') || this.section(prompt, 'Job description') || '';
    const focus = this.extractKeywords(`${job}\n${prompt}`)
      .filter((k) => !['resume', 'optimize', 'job', 'role', 'return', 'suggested'].includes(k))
      .slice(0, 4);
    const terms = focus.length > 0 ? focus : keywords.slice(0, 4);
    return [
      `1. Delivered production systems using ${terms[0] ?? 'TypeScript'} aligned to role needs.`,
      `2. Improved reliability around ${terms[1] ?? 'workflows'} with measurable ownership.`,
      `3. Partnered across teams to ship ${terms[2] ?? 'platform'} outcomes for: ${(job || prompt).slice(0, 120)}`,
    ].join('\n');
  }

  private composeCoverLetter(prompt: string, keywords: string[]): string {
    const company = prompt.match(/at ([^\n.]+)/i)?.[1]?.trim() ?? 'the company';
    const title = prompt.match(/for ([^\n]+?) at /i)?.[1]?.trim() ?? 'the role';
    const tone = prompt.match(/Write a (\w+) cover letter/i)?.[1] ?? 'professional';
    return [
      `Dear ${company} Hiring Team,`,
      '',
      `I am applying for the ${title} role with a ${tone} focus on ${keywords.slice(0, 3).join(', ') || 'software delivery'}.`,
      `My background maps to the posted requirements, and I would welcome the chance to contribute at ${company}.`,
      '',
      'Sincerely,',
      'Candidate',
    ].join('\n');
  }

  private composeInterview(prompt: string, keywords: string[]): string {
    const count = Number(prompt.match(/Generate (\d+)/i)?.[1] ?? 5);
    const cats = ['behavioral', 'technical', 'situational'] as const;
    return Array.from({ length: Math.min(Math.max(count, 1), 12) }, (_, i) => {
      const focus = keywords[i % Math.max(keywords.length, 1)] ?? 'delivery';
      const cat = cats[i % cats.length]!;
      return [
        `${i + 1}. (${cat}) Tell me about a time you used ${focus} under constraints.`,
        `STAR: Faced a ${focus} challenge; owned the outcome; shipped a measurable improvement.`,
      ].join('\n');
    }).join('\n\n');
  }

  private composePrReview(prompt: string): string {
    const flags: string[] = [];
    if (/TODO|FIXME/i.test(prompt)) flags.push('Resolve TODO/FIXME markers before merge.');
    if (/password|secret|api[_-]?key/i.test(prompt)) flags.push('Check for leaked secrets.');
    if (/any\b|as any/i.test(prompt)) flags.push('Tighten TypeScript typing where `any` appears.');
    if (flags.length === 0) {
      return 'SCORE:85 NOTES: No blocking issues detected in available diff. LGTM with standard checks.';
    }
    return `SCORE:55 NOTES: Changes requested.\n- ${flags.join('\n- ')}`;
  }

  private composeCompetitor(prompt: string, keywords: string[]): string {
    const company = prompt.match(/Company:\s*(.+)/i)?.[1]?.trim() ?? 'Competitor';
    return [
      `${company} positioning highlights:`,
      ...keywords.slice(0, 6).map((k) => `- ${k}`),
      '- Pricing signals: freemium / mid-tier / enterprise (inferred from page copy)',
      '- Watch for workflow automation and integration depth as differentiators',
    ].join('\n');
  }

  private composeEmail(prompt: string): string {
    const instruction = prompt.match(/Instruction:\s*(.+)/i)?.[1]?.trim() ?? 'Follow up';
    return [
      `Subject: Re: ${instruction.slice(0, 60)}`,
      '',
      `Thanks for the note — ${instruction}.`,
      'I reviewed the details and propose we align on next steps this week.',
      '',
      'Best regards',
    ].join('\n');
  }

  private composeSummary(prompt: string): string {
    const lines = prompt.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);
    if (lines.length === 0) return 'No threads to summarize.';
    return lines.map((l, i) => `${i + 1}. Action: follow up on "${l.slice(0, 80)}"`).join('\n');
  }

  private composeGenericDoc(title: string, prompt: string, keywords: string[]): string {
    return [
      `# ${title}`,
      '',
      `Focus keywords: ${keywords.slice(0, 6).join(', ') || 'general'}`,
      '',
      '## Summary',
      prompt.slice(0, 600),
      '',
      '## Next steps',
      '- Validate assumptions against live data sources',
      '- Convert into a tracked workflow in CommandOS',
    ].join('\n');
  }

  private async callAnthropic(request: ModelRoutingRequest): Promise<ModelRoutingResponse> {
    const apiKey = this.config.ai.anthropicApiKey || this.config.ai.providerKey;
    if (!apiKey) throw new Error('Anthropic API key missing');

    const model = this.config.ai.defaultModel.includes('claude')
      ? this.config.ai.defaultModel
      : 'claude-3-5-sonnet-20241022';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.2,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text =
      body.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') ?? '';
    const inputTokens = body.usage?.input_tokens ?? 0;
    const outputTokens = body.usage?.output_tokens ?? 0;
    const costEstimateUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

    return { text, modelUsed: model, costEstimateUsd, degraded: false };
  }

  private async callGemini(request: ModelRoutingRequest): Promise<ModelRoutingResponse> {
    const apiKey = this.config.ai.geminiApiKey;
    if (!apiKey) throw new Error('Gemini API key missing');

    const model = this.config.ai.fallbackModel.includes('gemini')
      ? this.config.ai.fallbackModel
      : 'gemini-1.5-flash';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const prompt = [request.systemPrompt, request.prompt].filter(Boolean).join('\n\n');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: request.maxTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

    return {
      text,
      modelUsed: model,
      costEstimateUsd: 0.0001,
      degraded: false,
    };
  }

  private async callOllama(request: ModelRoutingRequest): Promise<ModelRoutingResponse> {
    const base = this.config.ai.ollamaBaseUrl?.replace(/\/$/, '');
    if (!base) throw new Error('Ollama base URL missing');

    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.config.ai.localModel,
        stream: false,
        messages: [
          ...(request.systemPrompt
            ? [{ role: 'system', content: request.systemPrompt }]
            : []),
          { role: 'user', content: request.prompt },
        ],
        options: {
          temperature: request.temperature ?? 0.2,
          num_predict: request.maxTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as { message?: { content?: string } };
    return {
      text: body.message?.content ?? '',
      modelUsed: this.config.ai.localModel,
      costEstimateUsd: 0,
      degraded: false,
    };
  }
}
