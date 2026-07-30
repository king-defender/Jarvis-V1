import { describe, expect, it } from 'vitest';
import { extractKeywordsTask, matchResumeTask, parseHtmlTask } from './index.js';

describe('tasks library', () => {
  it('extracts keywords and match scores', async () => {
    const keywords = await extractKeywordsTask('TypeScript Node MongoDB TypeScript Redis');
    expect(keywords[0]).toBe('typescript');
    const match = matchResumeTask('typescript node redis', 'typescript golang kafka');
    expect(match.score).toBeGreaterThan(0);
    expect(match.missing).toContain('golang');
  });

  it('parses html titles', () => {
    const parsed = parseHtmlTask('<html><title>Hi</title><body><h1>Hello</h1></body></html>');
    expect(parsed.title).toBe('Hi');
    expect(parsed.text).toContain('Hello');
  });
});
