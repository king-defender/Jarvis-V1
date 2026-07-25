import Redis from 'ioredis';
import type { SystemConfig } from '../../config.js';
import type { ILoggingService } from '../services/logging.service.js';

export class CacheService {
  private readonly redis: Redis;
  private ready = false;

  constructor(
    config: SystemConfig,
    private readonly log: ILoggingService,
  ) {
    this.redis = new Redis(config.cache.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });

    this.redis.on('error', (error) => {
      if (this.ready) {
        this.log.warn('Redis error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  async connect(): Promise<void> {
    try {
      await this.redis.connect();
      this.ready = true;
      this.log.info('Redis cache connected');
    } catch (error) {
      this.ready = false;
      this.redis.disconnect(false);
      this.log.warn('Redis unavailable; continuing without cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.ready || this.redis.status !== 'ready') {
      return false;
    }
    const pong = await this.redis.ping();
    return pong === 'PONG';
  }

  async disconnect(): Promise<void> {
    if (this.ready) {
      await this.redis.quit();
      this.ready = false;
    }
  }
}
