export interface ConnectorConfig {
  apiKey?: string;
  oauthToken?: string;
  baseUrl: string;
  rateLimitLimit: number;
  rateLimitWindowMs: number;
}

export interface IConnector {
  id: string;
  initialize(config: ConnectorConfig): Promise<void>;
  testConnection(): Promise<{ healthy: boolean; error?: string }>;
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    this.tokens = limit;
    this.lastRefill = Date.now();
  }

  take(): boolean {
    const now = Date.now();
    if (now - this.lastRefill >= this.windowMs) {
      this.tokens = this.limit;
      this.lastRefill = now;
    }
    if (this.tokens <= 0) return false;
    this.tokens -= 1;
    return true;
  }
}

export abstract class BaseConnector implements IConnector {
  abstract id: string;
  protected config?: ConnectorConfig;
  private bucket?: TokenBucket;

  async initialize(config: ConnectorConfig): Promise<void> {
    this.config = config;
    this.bucket = new TokenBucket(config.rateLimitLimit, config.rateLimitWindowMs);
  }

  protected assertReady(): ConnectorConfig {
    if (!this.config) throw new Error(`Connector ${this.id} not initialized`);
    return this.config;
  }

  protected async guardedFetch(input: string, init?: RequestInit): Promise<Response> {
    const config = this.assertReady();
    if (this.bucket && !this.bucket.take()) {
      throw new Error(`Rate limit exceeded for connector ${this.id}`);
    }
    const headers = new Headers(init?.headers);
    const token = config.oauthToken || config.apiKey;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }

  abstract testConnection(): Promise<{ healthy: boolean; error?: string }>;
}

export class HttpConnector extends BaseConnector {
  constructor(public readonly id: string) {
    super();
  }

  async testConnection(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const config = this.assertReady();
      const response = await this.guardedFetch(config.baseUrl, { method: 'GET' });
      return { healthy: response.ok || response.status < 500 };
    } catch (error: unknown) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class ConnectorRegistry {
  private readonly connectors = new Map<string, IConnector>();

  register(connector: IConnector): void {
    this.connectors.set(connector.id, connector);
  }

  get(id: string): IConnector | undefined {
    return this.connectors.get(id);
  }

  list(): string[] {
    return [...this.connectors.keys()];
  }
}
