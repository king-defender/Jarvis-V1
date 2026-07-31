import { randomUUID } from 'node:crypto';
import { RuleEngineEvaluator, type RuleGroup } from '../rules/rule-engine.evaluator.js';
import type { ApprovalService } from '../../orchestration/approval/approval.service.js';
import type { INotificationService } from '../../infrastructure/services/notification.service.js';
import type { IStorageService } from '../../infrastructure/services/storage.service.js';
import type { SystemCommandDirective } from '../../shared/types/command.types.js';

export type DecisionActionType =
  | 'DISPATCH_COMMAND'
  | 'TRIGGER_APPROVAL'
  | 'SKIP'
  | 'NOTIFY';

export interface DecisionAction {
  type: DecisionActionType;
  command?: string | undefined;
  payloadTemplate?: Record<string, unknown> | undefined;
  channel?: 'slack' | 'email' | undefined;
  message?: string | undefined;
}

export interface DecisionPolicy {
  id: string;
  name: string;
  ruleGroup: RuleGroup;
  onMatch: DecisionAction;
  onMiss: DecisionAction;
}

export interface DecisionResult {
  matched: boolean;
  action: DecisionAction;
  execution?: {
    status: 'SKIPPED' | 'DISPATCHED' | 'PENDING_REVIEW' | 'NOTIFIED' | 'FAILED';
    detail?: unknown;
  };
}

export class DecisionEngine {
  decide(
    data: Record<string, unknown>,
    policy: DecisionPolicy,
  ): { matched: boolean; action: DecisionAction } {
    const matched = RuleEngineEvaluator.evaluateGroup(data, policy.ruleGroup);
    return {
      matched,
      action: matched ? policy.onMatch : policy.onMiss,
    };
  }

  async decideAndExecute(
    data: Record<string, unknown>,
    policy: DecisionPolicy,
    deps: {
      userId: string;
      transactionId?: string;
      storage: IStorageService;
      approvalService: ApprovalService;
      notifications: INotificationService;
      slackWebhookUrl?: string;
      runCommand: (directive: SystemCommandDirective) => Promise<unknown>;
    },
  ): Promise<DecisionResult> {
    const decided = this.decide(data, policy);
    const execution = await this.executeAction(decided.action, data, deps);

    await deps.storage.collection('decision_log').insertOne({
      id: randomUUID(),
      policy_id: policy.id,
      matched: decided.matched,
      action: decided.action,
      execution,
      created_at: new Date().toISOString(),
    });

    return { ...decided, execution };
  }

  private async executeAction(
    action: DecisionAction,
    data: Record<string, unknown>,
    deps: {
      userId: string;
      transactionId?: string;
      approvalService: ApprovalService;
      notifications: INotificationService;
      slackWebhookUrl?: string;
      runCommand: (directive: SystemCommandDirective) => Promise<unknown>;
    },
  ): Promise<NonNullable<DecisionResult['execution']>> {
    try {
      switch (action.type) {
        case 'SKIP':
          return { status: 'SKIPPED' };
        case 'NOTIFY': {
          const message = action.message ?? `Decision notify: ${JSON.stringify(data).slice(0, 200)}`;
          if (action.channel === 'slack' && deps.slackWebhookUrl) {
            await deps.notifications.dispatchSlackWebhook(deps.slackWebhookUrl, message);
          } else {
            deps.notifications.dispatchLocalAlert('decision.notify', message);
          }
          return { status: 'NOTIFIED', detail: { channel: action.channel ?? 'local' } };
        }
        case 'TRIGGER_APPROVAL': {
          if (!action.command) {
            throw new Error('TRIGGER_APPROVAL requires action.command');
          }
          const approval = await deps.approvalService.requestApproval({
            command: action.command,
            payload: action.payloadTemplate ?? data,
            userId: deps.userId,
            transactionId: deps.transactionId ?? randomUUID(),
          });
          return { status: 'PENDING_REVIEW', detail: approval };
        }
        case 'DISPATCH_COMMAND': {
          if (!action.command) {
            throw new Error('DISPATCH_COMMAND requires action.command');
          }
          const result = await deps.runCommand({
            transactionId: deps.transactionId ?? randomUUID(),
            command: action.command,
            timestamp: new Date().toISOString(),
            payload: action.payloadTemplate ?? data,
            context: {
              userId: deps.userId,
              triggerSource: 'DASHBOARD',
              bypassCache: false,
            },
          });
          if (
            result &&
            typeof result === 'object' &&
            'status' in result &&
            (result as { status?: string }).status === 'PENDING_REVIEW'
          ) {
            return { status: 'PENDING_REVIEW', detail: result };
          }
          return { status: 'DISPATCHED', detail: result };
        }
        default:
          return { status: 'FAILED', detail: `Unknown action type` };
      }
    } catch (error: unknown) {
      return {
        status: 'FAILED',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
