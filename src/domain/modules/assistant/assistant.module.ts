import { z } from 'zod';
import type { CommandRegistration } from '../../../shared/types/command.types.js';
import type { MemoryService } from '../../../infrastructure/services/memory.service.js';
import { interpretUtterance } from './intent-resolver.js';

const InterpretSchema = z.object({
  utterance: z.string().min(1),
  autoExecute: z.boolean().default(false),
});

const TeachSchema = z.object({
  phrase: z.string().min(1),
  kind: z.enum(['command', 'workflow']),
  target: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  spokenReply: z.string().optional(),
});

const RememberSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

const FeedbackSchema = z.object({
  rating: z.enum(['up', 'down']),
  note: z.string().default(''),
  relatedId: z.string().optional(),
});

const RecallSchema = z.object({
  key: z.string().optional(),
});

export function getAssistantCommandRegistrations(deps: {
  memory: MemoryService;
}): CommandRegistration[] {
  return [
    {
      command: 'assistant.interpret',
      schema: InterpretSchema,
      handler: async (payload: z.infer<typeof InterpretSchema>, context) => {
        const taught = await deps.memory.findTaughtIntent(context.userId, payload.utterance);
        const intent = interpretUtterance(
          payload.utterance,
          taught
            ? {
                kind: taught.kind,
                target: taught.target,
                payload: taught.payload,
                spokenReply: taught.spokenReply,
              }
            : null,
        );
        return {
          intent,
          autoExecute: payload.autoExecute,
          executed: false,
          message: payload.autoExecute
            ? 'Use POST /api/assistant/interpret with autoExecute=true to run intents.'
            : undefined,
        };
      },
    },
    {
      command: 'assistant.teach',
      schema: TeachSchema,
      handler: async (payload: z.infer<typeof TeachSchema>, context) => {
        const taught = await deps.memory.teachIntent({
          userId: context.userId,
          phrase: payload.phrase,
          kind: payload.kind,
          target: payload.target,
          payload: payload.payload,
          ...(payload.spokenReply ? { spokenReply: payload.spokenReply } : {}),
        });
        await deps.memory.recordInteraction({
          userId: context.userId,
          command: 'assistant.teach',
          ok: true,
          summary: `Taught "${payload.phrase}" → ${payload.target}`,
        });
        return { taught };
      },
    },
    {
      command: 'assistant.remember',
      schema: RememberSchema,
      handler: async (payload: z.infer<typeof RememberSchema>, context) => {
        const note = await deps.memory.remember(context.userId, payload.key, payload.value);
        return { note };
      },
    },
    {
      command: 'assistant.recall',
      schema: RecallSchema,
      handler: async (payload: z.infer<typeof RecallSchema>, context) => {
        const notes = await deps.memory.recall(context.userId, payload.key);
        const teachings = await deps.memory.listTeachings(context.userId);
        return { notes, teachings };
      },
    },
    {
      command: 'assistant.feedback',
      schema: FeedbackSchema,
      handler: async (payload: z.infer<typeof FeedbackSchema>, context) => {
        const event = await deps.memory.feedback({
          userId: context.userId,
          rating: payload.rating,
          note: payload.note,
          ...(payload.relatedId ? { relatedId: payload.relatedId } : {}),
        });
        return { event };
      },
    },
  ];
}
