import { describe, expect, it } from 'vitest';
import { SearchService } from './search.service.js';

describe('SearchService', () => {
  it('returns search results from DDG or local fallback', async () => {
    const search = new SearchService({
      info() {},
      warn() {},
      error() {},
      child() {
        return this;
      },
    });

    const results = await search.query('TypeScript engineer Remote', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
    expect(results[0]?.title.length).toBeGreaterThan(0);
    expect(results[0]?.url).toMatch(/^https?:\/\//);
    expect(results[0]?.snippet.length).toBeGreaterThan(0);
  });
});
