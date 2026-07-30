import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ModelRouterService } from '../../../infrastructure/ai/model-router.service.js';
import type { IStorageService } from '../../../infrastructure/services/storage.service.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../../infrastructure/services/event-bus.service.js';
import type { CommandRegistration } from '../../../shared/types/command.types.js';

const SummarizeSchema = z.object({
  folder: z.enum(['inbox', 'archive']).default('inbox'),
  maxThreads: z.number().int().positive().default(5),
});

const DraftReplySchema = z.object({
  emailBody: z.string().min(5),
  userInstruction: z.string().min(3),
});

const SendAlertSchema = z.object({
  channel: z.enum(['slack', 'email']),
  recipient: z.string().min(1),
  subject: z.string().min(1),
  message: z.string().min(1),
});

export function getCommunicationCommandRegistrations(deps: {
  storage: IStorageService;
  modelRouter: ModelRouterService;
  eventBus: ISystemEventBus;
  webhookUrl?: string;
}): CommandRegistration[] {
  return [
    {
      command: 'communication.summarize-emails',
      schema: SummarizeSchema,
      handler: async (payload: z.infer<typeof SummarizeSchema>, context) => {
        const stored = await deps.storage
          .collection('email_threads')
          .find({ user_id: context.userId, folder: payload.folder })
          .limit(payload.maxThreads)
          .toArray();

        const threads =
          stored.length > 0
            ? stored
            : Array.from({ length: Math.min(3, payload.maxThreads) }, (_, i) => ({
                threadId: `local-${i + 1}`,
                subject: `Sample ${payload.folder} thread ${i + 1}`,
                snippet: 'Action needed: review and respond.',
              }));

        const summaries = threads.map((t) => {
          const row = t as Record<string, unknown>;
          return {
            threadId: String(row.threadId ?? row.id ?? randomUUID()),
            subject: String(row.subject ?? ''),
            snippet: String(row.snippet ?? ''),
          };
        });

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'communication.emails_summarized',
            payload: { threadsCount: summaries.length, folder: payload.folder },
            producer: 'CommunicationModule',
          }),
        );

        return { threadsCount: summaries.length, summaries };
      },
    },
    {
      command: 'communication.draft-reply',
      schema: DraftReplySchema,
      handler: async (payload: z.infer<typeof DraftReplySchema>) => {
        const ai = await deps.modelRouter.complete({
          systemPrompt: 'Draft concise professional email replies.',
          prompt: `Instruction: ${payload.userInstruction}\n\nEmail:\n${payload.emailBody}`,
        });

        const subjectDraft = payload.userInstruction.slice(0, 60);
        const bodyDraft = ai.text.slice(0, 1500);

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'communication.reply_drafted',
            payload: { subjectDraft },
            producer: 'CommunicationModule',
          }),
        );

        return { subjectDraft, bodyDraft, modelUsed: ai.modelUsed };
      },
    },
    {
      command: 'communication.send-alert',
      schema: SendAlertSchema,
      handler: async (payload: z.infer<typeof SendAlertSchema>, context) => {
        const messageId = randomUUID();
        const now = new Date().toISOString();
        let status: 'sent' | 'failed' = 'sent';

        if (payload.channel === 'slack' && deps.webhookUrl) {
          try {
            const response = await fetch(deps.webhookUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                text: `*${payload.subject}*\n${payload.message}\n→ ${payload.recipient}`,
              }),
            });
            if (!response.ok) status = 'failed';
          } catch {
            status = 'failed';
          }
        }

        await deps.storage.collection('sent_notifications').insertOne({
          id: messageId,
          user_id: context.userId,
          recipient: payload.recipient,
          channel: payload.channel,
          subject: payload.subject,
          message: payload.message,
          status,
          sent_at: now,
        });

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'communication.alert_dispatched',
            payload: { messageId, status, channel: payload.channel },
            producer: 'CommunicationModule',
          }),
        );

        return { status, messageId };
      },
    },
  ];
}
