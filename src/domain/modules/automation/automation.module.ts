import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ISchedulerService } from '../../../infrastructure/services/scheduler.service.js';
import type { IStorageService } from '../../../infrastructure/services/storage.service.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../../infrastructure/services/event-bus.service.js';
import type {
  CommandRegistration,
  SystemCommandDirective,
} from '../../../shared/types/command.types.js';

const RegisterTriggerSchema = z.object({
  name: z.string().min(1),
  cron: z.string().min(1),
  command: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});

const RunWorkflowSchema = z.object({
  workflowName: z.string().min(1),
  inputPayload: z.record(z.unknown()).default({}),
});

export function getAutomationCommandRegistrations(deps: {
  storage: IStorageService;
  scheduler: ISchedulerService;
  eventBus: ISystemEventBus;
  startWorkflow: (input: {
    name: string;
    userId: string;
    payload?: Record<string, unknown>;
  }) => Promise<{ workflowId: string; status: string }>;
  runCommand: (directive: SystemCommandDirective) => Promise<unknown>;
}): CommandRegistration[] {
  return [
    {
      command: 'automation.register-trigger',
      schema: RegisterTriggerSchema,
      handler: async (payload: z.infer<typeof RegisterTriggerSchema>, context) => {
        const triggerId = randomUUID();
        const now = new Date().toISOString();

        const jobId = deps.scheduler.registerJob(payload.cron, async () => {
          const firedAt = new Date().toISOString();
          await deps.storage.collection('automation_triggers').updateOne(
            { id: triggerId },
            { $set: { last_fired_at: firedAt, updated_at: firedAt } },
          );

          deps.eventBus.publish(
            createSystemEvent({
              transactionId: randomUUID(),
              eventName: 'automation.trigger_fired',
              payload: { triggerId, command: payload.command },
              producer: 'AutomationModule',
            }),
          );

          await deps.runCommand({
            transactionId: randomUUID(),
            command: payload.command,
            timestamp: firedAt,
            payload: payload.payload,
            context: {
              userId: context.userId,
              triggerSource: 'CRON',
              bypassCache: false,
            },
          });
        });

        await deps.storage.collection('automation_triggers').insertOne({
          id: triggerId,
          scheduler_job_id: jobId,
          name: payload.name,
          cron_expression: payload.cron,
          target_command: payload.command,
          payload_json: payload.payload,
          is_active: 1,
          user_id: context.userId,
          last_fired_at: null,
          created_at: now,
          updated_at: now,
        });

        deps.eventBus.publish(
          createSystemEvent({
            transactionId: randomUUID(),
            eventName: 'automation.trigger_registered',
            payload: { triggerId, cron: payload.cron },
            producer: 'AutomationModule',
          }),
        );

        return {
          triggerId,
          nextRunAt: `cron:${payload.cron}`,
        };
      },
    },
    {
      command: 'automation.run-workflow',
      schema: RunWorkflowSchema,
      handler: async (payload: z.infer<typeof RunWorkflowSchema>, context) => {
        const result = await deps.startWorkflow({
          name: payload.workflowName,
          userId: context.userId,
          payload: payload.inputPayload,
        });
        return {
          workflowExecutionId: result.workflowId,
          status: result.status,
        };
      },
    },
  ];
}
