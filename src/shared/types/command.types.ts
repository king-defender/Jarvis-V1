import { z } from 'zod';

export const TriggerSourceSchema = z.enum(['CLI', 'DASHBOARD', 'CRON', 'WEBHOOK']);
export type TriggerSource = z.infer<typeof TriggerSourceSchema>;

export const CommandContextSchema = z.object({
  userId: z.string().min(1),
  triggerSource: TriggerSourceSchema,
  bypassCache: z.boolean().default(false),
});

export type CommandContext = z.infer<typeof CommandContextSchema>;

export const SystemCommandDirectiveSchema = z.object({
  transactionId: z.string().uuid(),
  command: z.string().min(1),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()).default({}),
  context: CommandContextSchema,
});

export type SystemCommandDirective<T = Record<string, unknown>> = {
  transactionId: string;
  command: string;
  timestamp: string;
  payload: T;
  context: CommandContext;
};

export type CommandHandler<TInput = Record<string, unknown>, TOutput = unknown> = (
  payload: TInput,
  context: CommandContext,
) => Promise<TOutput>;

export interface CommandRegistration {
  command: string;
  schema: z.ZodTypeAny;
  handler: CommandHandler<any, any>;
}
