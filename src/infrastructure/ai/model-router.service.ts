import type { SystemConfig } from '../../config.js';
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

/**
 * Tiered model router with deterministic local fallback (no external LLM required).
 */
export class ModelRouterService {
  constructor(
    private readonly config: SystemConfig,
    private readonly log: ILoggingService,
  ) {}

  async complete(request: ModelRoutingRequest): Promise<ModelRoutingResponse> {
    if (this.config.ai.providerKey) {
      try {
        // Placeholder for real provider SDKs; keep offline-first.
        this.log.info('AI provider key present; using deterministic composer', {
          model: this.config.ai.defaultModel,
        });
      } catch (error: unknown) {
        this.log.warn('Primary model failed; degrading', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

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
}
