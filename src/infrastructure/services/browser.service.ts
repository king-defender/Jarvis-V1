import fs from 'node:fs/promises';
import path from 'node:path';
import type { SystemConfig } from '../../config.js';
import type { ILoggingService } from './logging.service.js';

export interface BrowserPageContent {
  url: string;
  title: string;
  html: string;
  text: string;
  mode: 'fetch' | 'playwright';
}

export interface ScreenshotResult {
  imagePath: string;
  width: number;
  height: number;
  mode: 'fetch' | 'playwright';
}

export interface IBrowserService {
  getBrowserContext(): Promise<{ mode: 'fetch' | 'playwright' }>;
  fetchPage(url: string): Promise<BrowserPageContent>;
  screenshot(url: string, outputPath: string, selector?: string): Promise<ScreenshotResult>;
  closeAll(): Promise<void>;
}

type PlaywrightModule = typeof import('playwright');

/**
 * Browser abstraction with Playwright when available, HTTP fetch fallback otherwise.
 */
export class BrowserService implements IBrowserService {
  private open = true;
  private playwright: PlaywrightModule | undefined;
  private browser: import('playwright').Browser | undefined;
  private mode: 'fetch' | 'playwright' = 'fetch';

  constructor(
    private readonly config: SystemConfig,
    private readonly log: ILoggingService,
  ) {}

  async init(): Promise<void> {
    if (this.config.browser.engine === 'fetch') {
      this.mode = 'fetch';
      return;
    }

    try {
      this.playwright = await import('playwright');
      this.browser = await this.playwright.chromium.launch({
        headless: this.config.browser.headless,
      });
      this.mode = 'playwright';
      this.log.info('Playwright Chromium launched');
    } catch (error: unknown) {
      this.mode = 'fetch';
      this.log.warn('Playwright unavailable; using fetch browser mode', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getBrowserContext(): Promise<{ mode: 'fetch' | 'playwright' }> {
    return { mode: this.mode };
  }

  async fetchPage(url: string): Promise<BrowserPageContent> {
    if (!this.open) throw new Error('BrowserService is closed');

    if (this.mode === 'playwright' && this.browser) {
      const context = await this.browser.newContext({
        userAgent: 'CommandOS-Browser/0.1',
      });
      const page = await context.newPage();
      try {
        await page.goto(url, {
          timeout: this.config.browser.timeoutMs,
          waitUntil:
            this.config.browser.pageLoadStrategy === 'networkidle'
              ? 'networkidle'
              : this.config.browser.pageLoadStrategy,
        });
        const html = await page.content();
        const title = await page.title();
        const text = await page.innerText('body').catch(() => '');
        return {
          url,
          title,
          html,
          text: text.replace(/\s+/g, ' ').trim().slice(0, 20_000),
          mode: 'playwright',
        };
      } finally {
        await context.close();
      }
    }

    return this.fetchViaHttp(url);
  }

  async screenshot(
    url: string,
    outputPath: string,
    selector?: string,
  ): Promise<ScreenshotResult> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    if (this.mode === 'playwright' && this.browser) {
      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();
      try {
        await page.goto(url, {
          timeout: this.config.browser.timeoutMs,
          waitUntil: 'domcontentloaded',
        });
        const target = selector ? page.locator(selector).first() : page;
        await target.screenshot({ path: outputPath, type: 'png' });
        return { imagePath: outputPath, width: 1280, height: 720, mode: 'playwright' };
      } finally {
        await context.close();
      }
    }

    const page = await this.fetchViaHttp(url);
    const htmlPath = outputPath.replace(/\.png$/i, '.html');
    await fs.writeFile(
      htmlPath,
      `<!doctype html><meta charset="utf-8"><title>${page.title}</title><pre>${page.text.slice(0, 20_000)}</pre>`,
      'utf8',
    );
    return { imagePath: htmlPath, width: 1280, height: 720, mode: 'fetch' };
  }

  private async fetchViaHttp(url: string): Promise<BrowserPageContent> {
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
        mode: 'fetch',
      };
    } catch (error: unknown) {
      this.log.warn('Browser fetch failed; returning empty page shell', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      return { url, title: 'unavailable', html: '', text: '', mode: 'fetch' };
    } finally {
      clearTimeout(timeout);
    }
  }

  async closeAll(): Promise<void> {
    this.open = false;
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }
}
