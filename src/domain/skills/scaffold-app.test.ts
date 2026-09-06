import { describe, expect, it } from 'vitest';
import { scaffoldAppSkill } from './index.js';
import { PromptLibrary, SafetyService } from '../../infrastructure/ai/prompt-safety-eval.js';
import type { ModelRouterService } from '../../infrastructure/ai/model-router.service.js';

function fakeRouter(text: string, degraded = false): ModelRouterService {
  return {
    complete: async () => ({
      text,
      modelUsed: 'fake-model',
      costEstimateUsd: 0,
      degraded,
    }),
  } as unknown as ModelRouterService;
}

describe('scaffoldAppSkill', () => {
  const prompts = new PromptLibrary();
  const safety = new SafetyService();

  it('parses a well-formed JSON scaffold response into files', async () => {
    const aiJson = JSON.stringify({
      plan: 'A tiny Express health-check API.',
      files: [
        { path: 'package.json', content: '{"name":"tiny-api"}' },
        { path: 'src/index.js', content: 'console.log("up");' },
      ],
    });
    const result = await scaffoldAppSkill({
      description: 'A tiny Express health-check API',
      stack: 'node',
      modelRouter: fakeRouter(aiJson),
      prompts,
      safety,
    });

    expect(result.degraded).toBe(false);
    expect(result.plan).toContain('Express');
    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.path)).toEqual(['package.json', 'src/index.js']);
  });

  it('unwraps a fenced JSON block', async () => {
    const fenced = '```json\n' + JSON.stringify({
      plan: 'Fenced plan',
      files: [{ path: 'README.md', content: '# hi' }],
    }) + '\n```';
    const result = await scaffoldAppSkill({
      description: 'Any idea',
      stack: 'node',
      modelRouter: fakeRouter(fenced),
      prompts,
      safety,
    });
    expect(result.files).toHaveLength(1);
    expect(result.plan).toBe('Fenced plan');
  });

  it('falls back to a minimal scaffold when the model output is not valid JSON', async () => {
    const result = await scaffoldAppSkill({
      description: 'An idea the model rambled about instead of returning JSON',
      stack: 'python',
      modelRouter: fakeRouter('Sure! Here is an app idea, no JSON at all.'),
      prompts,
      safety,
    });
    expect(result.degraded).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.path === 'README.md')).toBe(true);
  });

  it('drops files with no path or non-string content rather than throwing', async () => {
    const aiJson = JSON.stringify({
      plan: 'Mixed validity files',
      files: [
        { path: 'good.txt', content: 'ok' },
        { path: '', content: 'no path, should be dropped' },
        { path: 'bad.txt', content: 123 },
      ],
    });
    const result = await scaffoldAppSkill({
      description: 'Something with partially malformed AI output',
      stack: 'node',
      modelRouter: fakeRouter(aiJson),
      prompts,
      safety,
    });
    expect(result.files).toEqual([{ path: 'good.txt', content: 'ok' }]);
  });
});
