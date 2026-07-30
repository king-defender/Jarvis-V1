import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { IBrowserService } from '../../../infrastructure/services/browser.service.js';
import type { IStorageService } from '../../../infrastructure/services/storage.service.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../../infrastructure/services/event-bus.service.js';
import type { CommandRegistration } from '../../../shared/types/command.types.js';

const CrawlSchema = z.object({
  url: z.string().url(),
  waitForSelector: z.string().optional(),
  bypassCache: z.boolean().default(false),
});

const ScreenshotSchema = z.object({
  url: z.string().url(),
  selector: z.string().optional(),
});

export function getBrowserModuleCommandRegistrations(deps: {
  storage: IStorageService;
  browser: IBrowserService;
  eventBus: ISystemEventBus;
  baseDataPath: string;
}): CommandRegistration[] {
  return [
    {
      command: 'browser.crawl-page',
      schema: CrawlSchema,
      handler: async (payload: z.infer<typeof CrawlSchema>) => {
        const urlHash = createHash('sha1').update(payload.url).digest('hex');
        if (!payload.bypassCache) {
          const cached = await deps.storage
            .collection('browser_crawl_cache')
            .findOne({ url_hash: urlHash });
          if (cached) {
            return {
              pageTitle: String(cached.page_title ?? ''),
              rawHtml: String(cached.raw_html ?? ''),
              httpStatus: Number(cached.http_status ?? 200),
              fromCache: true,
            };
          }
        }

        const page = await deps.browser.fetchPage(payload.url);
        const httpStatus = page.html ? 200 : 503;
        const now = new Date().toISOString();
        await deps.storage.collection('browser_crawl_cache').updateOne(
          { url_hash: urlHash },
          {
            $set: {
              url_hash: urlHash,
              url: payload.url,
              page_title: page.title,
              raw_html: page.html.slice(0, 500_000),
              http_status: httpStatus,
              cached_at: now,
            },
          },
          { upsert: true },
        );

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'browser.page_crawled',
            payload: { url: payload.url, httpStatus },
            producer: 'BrowserModule',
          }),
        );

        return {
          pageTitle: page.title,
          rawHtml: page.html.slice(0, 50_000),
          httpStatus,
          fromCache: false,
        };
      },
    },
    {
      command: 'browser.screenshot',
      schema: ScreenshotSchema,
      handler: async (payload: z.infer<typeof ScreenshotSchema>) => {
        const dir = path.resolve(deps.baseDataPath, 'screenshots');
        await fs.mkdir(dir, { recursive: true });
        const fileName = `${createHash('sha1').update(payload.url).digest('hex').slice(0, 12)}.png`;
        const imagePath = path.join(dir, fileName);
        const shot = await deps.browser.screenshot(
          payload.url,
          imagePath,
          payload.selector,
        );

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'browser.screenshot_taken',
            payload: { url: payload.url, imagePath: shot.imagePath, mode: shot.mode },
            producer: 'BrowserModule',
          }),
        );

        return {
          imagePath: shot.imagePath,
          width: shot.width,
          height: shot.height,
          mode: shot.mode,
        };
      },
    },
  ];
}
