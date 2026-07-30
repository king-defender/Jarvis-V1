import { describe, expect, it } from 'vitest';
import { decryptString, encryptString } from './encryption.js';

describe('encryption', () => {
  it('round-trips AES-256-GCM payloads', () => {
    const secret = 'test-encryption-key';
    const cipher = encryptString('hello-secret', secret);
    expect(cipher.startsWith('v1:')).toBe(true);
    expect(decryptString(cipher, secret)).toBe('hello-secret');
  });
});
