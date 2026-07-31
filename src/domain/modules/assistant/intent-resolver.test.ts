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
    expect(interpretUtterance('hey are you there').command).toBe('system.ping');
  });

  it('returns help for empty or unknown', () => {
    expect(interpretUtterance('').kind).toBe('help');
    expect(interpretUtterance('xyzzy foobar').kind).toBe('unknown');
  });

  it('teaches phrase → command mappings', () => {
    const intent = interpretUtterance('when I say morning check run system.ping');
    expect(intent.command).toBe('assistant.teach');
    expect(intent.payload.target).toBe('system.ping');
  });

  it('prefers taught intents over builtins', () => {
    const intent = interpretUtterance('xyz custom', {
      kind: 'command',
      target: 'system.ping',
      payload: { message: 'taught' },
      spokenReply: 'Taught ping',
    });
    expect(intent.learned).toBe(true);
    expect(intent.command).toBe('system.ping');
  });

  it('maps self-edit instructions', () => {
    const intent = interpretUtterance('update your code to add a note about my preferred stack');
    expect(intent.command).toBe('platform.self-edit');
    expect(String(intent.payload.instruction)).toContain('add a note');
  });
});
