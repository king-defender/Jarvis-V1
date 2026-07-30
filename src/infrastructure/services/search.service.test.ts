import { describe, expect, it } from 'vitest';
import { SearchService } from './search.service.js';

describe('SearchService', () => {
  it('returns deterministic local job results', async () => {
    const search = new SearchService({
      info() {},
      warn() {},
      error() {},
      child() {
        return this;
      },
    });

    const results = await search.query('TypeScript engineer Remote', 3);
    expect(results).toHaveLength(3);
    expect(results[0]?.title).toContain('TypeScript');
    expect(results[0]?.url).toMatch(/^https:\/\/jobs\.example\.com\//);
  });
});
