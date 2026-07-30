import { randomUUID } from 'node:crypto';
import type { ILoggingService } from './logging.service.js';
import type { IStorageService } from './storage.service.js';

export interface IEmailService {
  sendMail(to: string, subject: string, htmlContent: string): Promise<string>;
}

export class EmailService implements IEmailService {
  constructor(
    private readonly storage: IStorageService,
    private readonly log: ILoggingService,
  ) {}

  async sendMail(to: string, subject: string, htmlContent: string): Promise<string> {
    const messageId = randomUUID();
    const now = new Date().toISOString();
    await this.storage.collection('outbound_email').insertOne({
      id: messageId,
      to,
      subject,
      html: htmlContent,
      status: 'queued_local',
      created_at: now,
    });
    this.log.info('Email queued locally (SMTP optional)', { messageId, to, subject });
    return messageId;
  }
}
