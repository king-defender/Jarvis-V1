import { z } from 'zod';
import type { CommandRegistration } from '../../../shared/types/command.types.js';
import { interpretUtterance } from './intent-resolver.js';

const InterpretSchema = z.object({
  utterance: z.string().min(1),
  autoExecute: z.boolean().default(false),
});

export function getAssistantCommandRegistrations(): CommandRegistration[] {
  return [
    {
      command: 'assistant.interpret',
      schema: InterpretSchema,
      handler: async (payload: z.infer<typeof InterpretSchema>) => {
        const intent = interpretUtterance(payload.utterance);
        if (payload.autoExecute) {
          return {
            intent,
            autoExecute: true,
            executed: false,
            message:
              'Use POST /api/assistant/interpret with autoExecute=true to run intents. ' +
              'assistant.interpret via /command is interpret-only.',
          };
        }
        return {
          intent,
          autoExecute: false,
          executed: false,
        };
      },
    },
  ];
}
