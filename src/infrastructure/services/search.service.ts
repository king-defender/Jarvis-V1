import { createHash } from 'node:crypto';
import type { ILoggingService } from './logging.service.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface ISearchService {
  query(searchTerm: string, limit?: number): Promise<SearchResult[]>;
}

/**
 * Deterministic search provider for Career job discovery.
 * Uses structured synthetic listings so the Career workflow works offline.
 * When SEARCH_API_URL is set, proxies to that HTTP JSON endpoint instead.
 */
export class SearchService implements ISearchService {
  constructor(
    private readonly log: ILoggingService,
    private readonly searchApiUrl?: string,
  ) {}

  async query(searchTerm: string, limit = 10): Promise<SearchResult[]> {
    if (this.searchApiUrl) {
      try {
        const url = new URL(this.searchApiUrl);
        url.searchParams.set('q', searchTerm);
        url.searchParams.set('limit', String(limit));
        const response = await fetch(url);
        if (response.ok) {
          const data = (await response.json()) as { results?: SearchResult[] };
          if (Array.isArray(data.results)) {
            return data.results.slice(0, limit);
          }
        }
      } catch (error: unknown) {
        this.log.warn('Search API unavailable; using local provider', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.localJobResults(searchTerm, limit);
  }

  private localJobResults(searchTerm: string, limit: number): SearchResult[] {
    const keywords = searchTerm
      .split(/\s+/)
      .map((k) => k.trim())
      .filter(Boolean);
    const role = keywords.slice(0, 3).join(' ') || 'Software Engineer';
    const companies = [
      'Northwind Labs',
      'Contoso Cloud',
      'Fabrikam AI',
      'Adventure Works',
      'Tailwind Systems',
    ];

    return companies.slice(0, limit).map((company, index) => {
      const idSeed = `${role}-${company}-${index}`;
      const id = createHash('sha1').update(idSeed).digest('hex').slice(0, 12);
      return {
        title: `${role} (${index % 2 === 0 ? 'Remote' : 'Hybrid'})`,
        url: `https://jobs.example.com/${id}`,
        snippet: `${company} is hiring for ${role}. Keywords: ${keywords.join(', ') || 'general'}. Competitive salary and benefits.`,
      };
    });
  }
}
