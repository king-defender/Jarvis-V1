import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelRouterService } from './model-router.service.js';
import type { SystemConfig } from '../../config.js';

const baseConfig = {
  ai: {
    mode: 'offline' as const,
    defaultModel: 'x',
    fallbackModel: 'y',
    localModel: 'llama3.2',
    monthlyLimitUsd: 50,
    ollamaTimeoutMs: 5_000,
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
          ollamaBaseUrl: 'http://127.0.0.1:11434',
        },
      } as SystemConfig,
      log as never,
    );
    const result = await router.complete({
      prompt: 'Research summary for Contoso',
    });
    expect(result.modelUsed).toBe('deterministic-composer');
  });

  it('uses Ollama chat API in ollama mode', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: 'llama3.2',
        message: { role: 'assistant', content: 'Hello from Ollama' },
      }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const router = new ModelRouterService(
      {
        ...baseConfig,
        ai: {
          ...baseConfig.ai,
          mode: 'ollama',
          ollamaBaseUrl: 'http://127.0.0.1:11434',
          localModel: 'llama3.2',
        },
      } as SystemConfig,
      log as never,
    );

    const result = await router.complete({ prompt: 'Say hi' });
    expect(result.modelUsed).toBe('llama3.2');
    expect(result.text).toBe('Hello from Ollama');
    expect(result.costEstimateUsd).toBe(0);
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(JSON.parse(String(init.body)).model).toBe('llama3.2');
  });

  it('reports Ollama status via /api/tags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }, { name: 'mistral:latest' }],
        }),
        text: async () => '',
      })),
    );

    const router = new ModelRouterService(
      {
        ...baseConfig,
        ai: {
          ...baseConfig.ai,
          mode: 'ollama',
          ollamaBaseUrl: 'http://127.0.0.1:11434',
        },
      } as SystemConfig,
      log as never,
    );

    const status = await router.status();
    expect(status.mode).toBe('ollama');
    expect(status.ollama.reachable).toBe(true);
    expect(status.ollama.models).toContain('llama3.2:latest');
  });

  it('falls back to deterministic composer when Ollama is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );

    const router = new ModelRouterService(
      {
        ...baseConfig,
        ai: {
          ...baseConfig.ai,
          mode: 'ollama',
          ollamaBaseUrl: 'http://127.0.0.1:11434',
        },
      } as SystemConfig,
      log as never,
    );

    const result = await router.complete({ prompt: 'Research summary for Acme' });
    expect(result.modelUsed).toBe('deterministic-composer');
  });
});
