import type { SystemConfig } from '../../config.js';
import type { ILoggingService } from './logging.service.js';

export interface BrowserPageContent {
  url: string;
  title: string;
  html: string;
  text: string;
}

export interface IBrowserService {
  getBrowserContext(): Promise<{ mode: 'fetch' | 'playwright' }>;
  fetchPage(url: string): Promise<BrowserPageContent>;
  closeAll(): Promise<void>;
}

/**
 * Browser abstraction. Uses HTTP fetch by default (no Playwright install required).
 * Can be swapped for Playwright later without changing callers.
 */
export class BrowserService implements IBrowserService {
  private open = true;

  constructor(
    private readonly config: SystemConfig,
    private readonly log: ILoggingService,
  ) {}

  async getBrowserContext(): Promise<{ mode: 'fetch' | 'playwright' }> {
    return { mode: 'fetch' };
  }

  async fetchPage(url: string): Promise<BrowserPageContent> {
    if (!this.open) {
      throw new Error('BrowserService is closed');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.browser.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent': 'CommandOS-Browser/0.1',
          accept: 'text/html,application/xhtml+xml',
        },
      });

      const html = await response.text();
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 20_000);

      return {
        url,
        title: titleMatch?.[1]?.trim() ?? url,
        html,
        text,
      };
    } catch (error: unknown) {
      this.log.warn('Browser fetch failed; returning empty page shell', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        url,
        title: 'unavailable',
        html: '',
        text: '',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async closeAll(): Promise<void> {
    this.open = false;
  }
}
