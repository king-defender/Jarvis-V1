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

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search provider: custom API → DuckDuckGo HTML → deterministic local jobs.
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
          if (Array.isArray(data.results) && data.results.length > 0) {
            return data.results.slice(0, limit);
          }
        }
      } catch (error: unknown) {
        this.log.warn('Search API unavailable; trying DuckDuckGo', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const ddg = await this.duckDuckGoResults(searchTerm, limit);
    if (ddg.length > 0) return ddg;

    return this.localJobResults(searchTerm, limit);
  }

  private async duckDuckGoResults(
    searchTerm: string,
    limit: number,
  ): Promise<SearchResult[]> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchTerm)}`;
      const response = await fetch(url, {
        headers: {
          'user-agent': 'CommandOS-Search/0.2',
          accept: 'text/html',
        },
      });
      if (!response.ok) return [];
      const html = await response.text();
      const text = stripHtml(html);
      const results: SearchResult[] = [];
      const linkPattern =
        /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const snippetPattern = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)/gi;
      const snippets = [...html.matchAll(snippetPattern)].map((m) =>
        stripHtml(m[1] ?? ''),
      );

      let i = 0;
      for (const match of html.matchAll(linkPattern)) {
        const href = match[1] ?? '';
        const title = stripHtml(match[2] ?? '');
        if (!title || !href) continue;
        const resolved = href.includes('uddg=')
          ? decodeURIComponent(href.split('uddg=')[1]?.split('&')[0] ?? href)
          : href;
        results.push({
          title,
          url: resolved.startsWith('http') ? resolved : `https:${resolved}`,
          snippet: snippets[i] || text.slice(0, 160),
        });
        i += 1;
        if (results.length >= limit) break;
      }
      if (results.length > 0) {
        this.log.info('DuckDuckGo search results', { count: results.length, searchTerm });
      }
      return results;
    } catch (error: unknown) {
      this.log.warn('DuckDuckGo search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
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
