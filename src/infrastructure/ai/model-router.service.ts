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
 * Tiered model router: Anthropic → Gemini → Ollama → deterministic offline fallback.
 */
export class ModelRouterService {
  private spentUsd = 0;

  constructor(
    private readonly config: SystemConfig,
    private readonly log: ILoggingService,
  ) {}

  async complete(request: ModelRoutingRequest): Promise<ModelRoutingResponse> {
    if (this.spentUsd >= this.config.ai.monthlyLimitUsd) {
      this.log.warn('AI monthly budget exhausted; using offline fallback');
      return this.offlineFallback(request);
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

    return this.offlineFallback(request);
  }

  private offlineFallback(request: ModelRoutingRequest): ModelRoutingResponse {
    const system = request.systemPrompt ? `${request.systemPrompt}\n\n` : '';
    const text = [
      system.trim(),
      '---',
      'Deterministic draft (offline ModelRouter fallback):',
      request.prompt.trim().slice(0, 2000),
    ]
      .filter(Boolean)
      .join('\n');

    return {
      text,
      modelUsed: this.config.ai.localModel,
      costEstimateUsd: 0,
      degraded: true,
    };
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
