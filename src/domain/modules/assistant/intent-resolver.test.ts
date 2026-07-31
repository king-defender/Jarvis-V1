import { describe, expect, it } from 'vitest';
import { interpretUtterance } from './intent-resolver.js';

describe('interpretUtterance', () => {
  it('maps job search speech to career.search-jobs', () => {
    const intent = interpretUtterance('search remote typescript jobs');
    expect(intent.kind).toBe('command');
    expect(intent.command).toBe('career.search-jobs');
    expect(intent.payload.keywords).toContain('TypeScript');
  });

  it('maps ping phrases', () => {
    const intent = interpretUtterance('hey are you there');
    expect(intent.command).toBe('system.ping');
  });

  it('returns help for empty or unknown', () => {
    expect(interpretUtterance('').kind).toBe('help');
    expect(interpretUtterance('xyzzy foobar').kind).toBe('unknown');
  });
});
