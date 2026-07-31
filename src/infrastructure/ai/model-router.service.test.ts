import { describe, expect, it } from 'vitest';
import { ModelRouterService } from './model-router.service.js';
import type { SystemConfig } from '../../config.js';

const baseConfig = {
  ai: {
    mode: 'offline' as const,
    defaultModel: 'x',
    fallbackModel: 'y',
    localModel: 'deterministic',
    monthlyLimitUsd: 50,
  },
} as SystemConfig;

const log = {
  info() {},
  warn() {},
  error() {},
  child() {
    return this;
  },
};

describe('ModelRouterService offline-first', () => {
  it('composes useful resume bullets without any API key', async () => {
    const router = new ModelRouterService(baseConfig, log as never);
    const result = await router.complete({
      systemPrompt: 'You are an ATS resume coach.',
      prompt: 'Optimize this resume for the job.\n\nRESUME:\nBuilt APIs\n\nJOB:\nTypeScript Node engineer',
    });
    expect(result.modelUsed).toBe('deterministic-composer');
    expect(result.degraded).toBe(false);
    expect(result.text.toLowerCase()).toContain('typescript');
    expect(result.costEstimateUsd).toBe(0);
  });

  it('never calls network in offline mode even if keys exist', async () => {
    const router = new ModelRouterService(
      {
        ...baseConfig,
        ai: {
          ...baseConfig.ai,
          mode: 'offline',
          anthropicApiKey: 'should-not-be-used',
        },
      } as SystemConfig,
      log as never,
    );
    const result = await router.complete({
      prompt: 'Research summary for Contoso',
    });
    expect(result.modelUsed).toBe('deterministic-composer');
  });
});
