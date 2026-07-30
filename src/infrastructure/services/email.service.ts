import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { SystemConfig } from '../../config.js';
import type { ILoggingService } from './logging.service.js';
import type { IStorageService } from './storage.service.js';

export interface IEmailService {
  sendMail(to: string, subject: string, htmlContent: string): Promise<string>;
}

export class EmailService implements IEmailService {
  private readonly transporter: nodemailer.Transporter | undefined;

  constructor(
    private readonly config: SystemConfig,
    private readonly storage: IStorageService,
    private readonly log: ILoggingService,
  ) {
    if (config.email.smtpHost && config.email.smtpUser) {
      this.transporter = nodemailer.createTransport({
        host: config.email.smtpHost,
        port: config.email.smtpPort,
        secure: config.email.smtpSecure,
        auth: {
          user: config.email.smtpUser,
          pass: config.email.smtpPass ?? '',
        },
      });
    }
  }

  async sendMail(to: string, subject: string, htmlContent: string): Promise<string> {
    const messageId = randomUUID();
    const now = new Date().toISOString();

    if (this.transporter) {
      const info = await this.transporter.sendMail({
        from: this.config.email.fromAddress,
        to,
        subject,
        html: htmlContent,
        messageId: `<${messageId}@commandos.local>`,
      });
      await this.storage.collection('outbound_email').insertOne({
        id: messageId,
        to,
        subject,
        html: htmlContent,
        status: 'sent',
        provider_id: info.messageId,
        created_at: now,
      });
      this.log.info('Email sent via SMTP', { messageId, to, subject });
      return messageId;
    }

    await this.storage.collection('outbound_email').insertOne({
      id: messageId,
      to,
      subject,
      html: htmlContent,
      status: 'queued_local',
      created_at: now,
    });
    this.log.info('Email queued locally (SMTP not configured)', { messageId, to, subject });
    return messageId;
  }
}
