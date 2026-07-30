import type { Db } from 'mongodb';
import { RuleEngineEvaluator, type RuleGroup } from '../../evaluation/rules/rule-engine.evaluator.js';
import {
  backoffDelayMs,
  classifyError,
  shouldRetry,
} from '../recovery/recovery.js';
import type {
  RunCommandFn,
  WorkflowContext,
  WorkflowStep,
} from './workflow.types.js';

export class WorkflowCoordinator {
  constructor(
    private context: WorkflowContext,
    private readonly db: Db,
  ) {}

  getContext(): WorkflowContext {
    return this.context;
  }

  private resolveValue(path: string, data: Record<string, unknown>): unknown {
    if (path.startsWith('$.')) {
      return path
        .split('.')
        .slice(1)
        .reduce<unknown>((obj, key) => {
          if (obj === null || obj === undefined || typeof obj !== 'object') {
            return undefined;
          }
          return (obj as Record<string, unknown>)[key];
        }, data);
    }
    return path;
  }

  private constructPayload(mapping: Record<string, string>): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const [key, pathValue] of Object.entries(mapping)) {
      payload[key] = this.resolveValue(pathValue, this.context.accumulatedData);
    }
    return payload;
  }

  async executeStep(
    step: WorkflowStep,
    runCommand: RunCommandFn,
    userId: string,
  ): Promise<boolean> {
    if (step.ruleGroupId) {
      const ruleGroup = await this.loadRuleGroup(step.ruleGroupId);
      if (ruleGroup) {
        const isAllowed = RuleEngineEvaluator.evaluateGroup(
          this.context.accumulatedData,
          ruleGroup,
        );
        if (!isAllowed) {
          this.context.accumulatedData[step.name] = { skipped: true, reason: 'rule_gate' };
          return true;
        }
      }
    }

    const stepPayload = this.constructPayload(step.payloadMapping);
    let attempts = 0;

    while (attempts <= step.retryAttempts) {
      try {
        const result = await runCommand(step.command, stepPayload, {
          transactionId: this.context.transactionId,
          userId,
          triggerSource: 'DASHBOARD',
          bypassCache: step.bypassCache ?? false,
        });
        this.context.accumulatedData[step.name] = result as unknown;
        return true;
      } catch (err: unknown) {
        attempts += 1;
        const error = err as { status?: string; partialOutput?: unknown; message?: string };
        const errorClass = classifyError(err);

        if (error.status === 'INTELLIGENCE_DEGRADED') {
          this.context.status = 'INTELLIGENCE_DEGRADED';
          this.context.accumulatedData[step.name] =
            (error.partialOutput as Record<string, unknown>) ?? {};
          return true;
        }

        if (!shouldRetry(errorClass) || attempts > step.retryAttempts) {
          this.context.status = 'FAILED';
          await this.db.collection('dead_letter_queue').insertOne({
            id: crypto.randomUUID(),
            workflow_id: this.context.workflowId,
            step: step.name,
            command: step.command,
            error_class: errorClass,
            error_message: error.message ?? String(err),
            created_at: new Date().toISOString(),
          });
          throw new Error(
            `Workflow execution aborted: Step "${step.name}" failed permanently.` +
              (error.message ? ` ${error.message}` : ''),
          );
        }

        await new Promise((resolve) => setTimeout(resolve, backoffDelayMs(attempts - 1)));
      }
    }

    return false;
  }

  private async loadRuleGroup(groupId: string): Promise<RuleGroup | null> {
    const doc = await this.db.collection('rule_groups').findOne({ id: groupId });
    if (!doc) {
      return null;
    }

    const conditions = await this.db
      .collection('rule_conditions')
      .find({ rule_group_id: groupId })
      .toArray();

    return {
      id: String(doc.id),
      name: String(doc.name),
      logicalOperator: doc.logical_operator === 'OR' ? 'OR' : 'AND',
      conditions: conditions.map((c) => ({
        field: String(c.field),
        operator: c.operator as RuleGroup['conditions'][number]['operator'],
        value: JSON.parse(String(c.value)) as string | number | boolean | string[],
      })),
    };
  }
}
