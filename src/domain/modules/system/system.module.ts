import { z } from 'zod';
import type { CommandRegistration } from '../../../shared/types/command.types.js';

const PingPayloadSchema = z.object({
  message: z.string().default('pong'),
});

/**
 * Built-in system commands for Sprint 1 smoke / health.
 * Control layer registers these; domain never imports control.
 */
export function getSystemCommandRegistrations(): CommandRegistration[] {
  return [
    {
      command: 'system.ping',
      schema: PingPayloadSchema,
      handler: async (payload: z.infer<typeof PingPayloadSchema>) => {
        return {
          ok: true,
          echo: payload.message,
          at: new Date().toISOString(),
        };
      },
    },
  ];
}
