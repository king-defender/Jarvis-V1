import { describe, expect, it } from 'vitest';
import { classifyError, shouldRetry } from './recovery.js';

describe('recovery', () => {
  it('classifies auth vs transient errors', () => {
    expect(classifyError(new Error('401 unauthorized'))).toBe('AUTHENTICATION');
    expect(classifyError(new Error('ECONNRESET network'))).toBe('TRANSIENT_NETWORK');
    expect(shouldRetry('AUTHENTICATION')).toBe(false);
    expect(shouldRetry('TRANSIENT_NETWORK')).toBe(true);
  });
});
