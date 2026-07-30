import type { ILoggingService } from './logging.service.js';
import type { IStorageService } from './storage.service.js';

export interface INotificationService {
  dispatchSlackWebhook(webhookUrl: string, text: string): Promise<void>;
  dispatchLocalAlert(title: string, message: string): void;
}

export class NotificationService implements INotificationService {
  constructor(
    private readonly storage: IStorageService,
    private readonly log: ILoggingService,
  ) {}

  async dispatchSlackWebhook(webhookUrl: string, text: string): Promise<void> {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }
    await this.storage.collection('notifications').insertOne({
      id: crypto.randomUUID(),
      channel: 'slack',
      text,
      created_at: new Date().toISOString(),
    });
  }

  dispatchLocalAlert(title: string, message: string): void {
    this.log.warn('local.alert', { title, message });
  }
}
