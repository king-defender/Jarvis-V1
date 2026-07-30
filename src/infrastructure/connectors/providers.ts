import type { ConnectorConfig, IConnector } from './connector.js';
import { BaseConnector } from './connector.js';

export class GitHubConnector extends BaseConnector {
  readonly id = 'github';

  async testConnection(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const config = this.assertReady();
      const response = await this.guardedFetch(`${config.baseUrl}/user`, {
        headers: { accept: 'application/vnd.github+json' },
      });
      if (!response.ok) {
        return { healthy: false, error: `GitHub HTTP ${response.status}` };
      }
      return { healthy: true };
    } catch (error: unknown) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getAuthenticatedUser(): Promise<Record<string, unknown>> {
    const config = this.assertReady();
    const response = await this.guardedFetch(`${config.baseUrl}/user`, {
      headers: { accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`GitHub user fetch failed: ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  }
}

export class SlackWebhookConnector implements IConnector {
  readonly id = 'slack-webhook';
  private webhookUrl?: string;

  async initialize(config: ConnectorConfig): Promise<void> {
    this.webhookUrl = config.baseUrl;
  }

  async testConnection(): Promise<{ healthy: boolean; error?: string }> {
    if (!this.webhookUrl) return { healthy: false, error: 'Not initialized' };
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'CommandOS connector health check' }),
      });
      return response.ok
        ? { healthy: true }
        : { healthy: false, error: `Slack HTTP ${response.status}` };
    } catch (error: unknown) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
