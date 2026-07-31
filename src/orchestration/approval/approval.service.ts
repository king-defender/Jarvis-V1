import { randomUUID } from 'node:crypto';
import type { IStorageService } from '../../infrastructure/services/storage.service.js';
import {
  createSystemEvent,
  type ISystemEventBus,
} from '../../infrastructure/services/event-bus.service.js';

export interface ApprovalPolicy {
  id: string;
  commandPattern: string;
  notificationChannel: 'slack' | 'email' | 'dashboard';
  autoApproveTimeoutMs?: number;
}

export type ApprovalStatus =
  | 'PENDING_REVIEW'
  | 'APPROVING'
  | 'APPROVED'
  | 'REJECTED';

export interface PendingApprovalRequest {
  id: string;
  command: string;
  payload: Record<string, unknown>;
  userId: string;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
  reason?: string;
}

function patternMatches(pattern: string, command: string): boolean {
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return command === prefix || command.startsWith(`${prefix}.`);
  }
  if (pattern.endsWith('*')) {
    return command.startsWith(pattern.slice(0, -1));
  }
  return pattern === command;
}

export class ApprovalService {
  private readonly policies: ApprovalPolicy[] = [
    {
      id: 'finance-high-risk',
      commandPattern: 'finance.*',
      notificationChannel: 'dashboard',
    },
    {
      id: 'communication-outbound',
      commandPattern: 'communication.send-alert',
      notificationChannel: 'dashboard',
    },
    {
      id: 'platform-email',
      commandPattern: 'platform.send-email',
      notificationChannel: 'dashboard',
    },
  ];

  constructor(
    private readonly storage: IStorageService,
    private readonly eventBus: ISystemEventBus,
  ) {}

  requiresApproval(command: string): boolean {
    return this.policies.some((p) => patternMatches(p.commandPattern, command));
  }

  async requestApproval(input: {
    command: string;
    payload: Record<string, unknown>;
    userId: string;
    transactionId: string;
  }): Promise<PendingApprovalRequest> {
    const now = new Date().toISOString();
    const request: PendingApprovalRequest = {
      id: randomUUID(),
      command: input.command,
      payload: input.payload,
      userId: input.userId,
      status: 'PENDING_REVIEW',
      createdAt: now,
    };

    await this.storage.collection('pending_approvals').insertOne({
      ...request,
      transaction_id: input.transactionId,
      created_at: now,
      updated_at: now,
    });

    this.eventBus.publish(
      createSystemEvent({
        transactionId: input.transactionId,
        eventName: 'approval.requested',
        payload: { approvalId: request.id, command: input.command },
        producer: 'ApprovalService',
      }),
    );

    return request;
  }

  async listPending(): Promise<Record<string, unknown>[]> {
    return this.storage
      .collection('pending_approvals')
      .find({ status: 'PENDING_REVIEW' })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray();
  }

  async getPending(approvalId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.storage.collection('pending_approvals').findOne({
      id: approvalId,
      status: 'PENDING_REVIEW',
    });
    return (doc as Record<string, unknown> | null) ?? null;
  }

  /** Atomically claim a pending approval so only one approver can execute it. */
  async claimForExecution(approvalId: string): Promise<Record<string, unknown> | null> {
    const now = new Date().toISOString();
    const result = await this.storage.collection('pending_approvals').findOneAndUpdate(
      { id: approvalId, status: 'PENDING_REVIEW' },
      {
        $set: {
          status: 'APPROVING',
          updated_at: now,
        },
      },
      { returnDocument: 'after' },
    );
    return (result as Record<string, unknown> | null) ?? null;
  }

  /** Release a claim back to PENDING_REVIEW after a failed execution attempt. */
  async releaseClaim(approvalId: string, reason?: string): Promise<void> {
    const now = new Date().toISOString();
    await this.storage.collection('pending_approvals').updateOne(
      { id: approvalId, status: 'APPROVING' },
      {
        $set: {
          status: 'PENDING_REVIEW',
          reason: reason ?? null,
          updated_at: now,
        },
      },
    );
  }

  async resolve(
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string,
  ): Promise<Record<string, unknown>> {
    const now = new Date().toISOString();
    const fromStatus = decision === 'APPROVED' ? 'APPROVING' : 'PENDING_REVIEW';
    const result = await this.storage.collection('pending_approvals').findOneAndUpdate(
      { id: approvalId, status: fromStatus },
      {
        $set: {
          status: decision,
          reason: reason ?? null,
          resolved_at: now,
          updated_at: now,
        },
      },
      { returnDocument: 'after' },
    );

    // Reject may also arrive while still PENDING_REVIEW if never claimed;
    // APPROVED must come from APPROVING (claim). Fallback for reject from either.
    if (!result && decision === 'REJECTED') {
      const fallback = await this.storage.collection('pending_approvals').findOneAndUpdate(
        { id: approvalId, status: { $in: ['PENDING_REVIEW', 'APPROVING'] } },
        {
          $set: {
            status: 'REJECTED',
            reason: reason ?? null,
            resolved_at: now,
            updated_at: now,
          },
        },
        { returnDocument: 'after' },
      );
      if (!fallback) {
        throw new Error(`Approval not found or already resolved: ${approvalId}`);
      }
      this.publishDecision(approvalId, decision, fallback);
      return fallback as Record<string, unknown>;
    }

    if (!result) {
      throw new Error(`Approval not found or already resolved: ${approvalId}`);
    }

    this.publishDecision(approvalId, decision, result);
    return result as Record<string, unknown>;
  }

  private publishDecision(
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    result: Record<string, unknown>,
  ): void {
    this.eventBus.publish(
      createSystemEvent({
        transactionId: String(result.transaction_id ?? randomUUID()),
        eventName: decision === 'APPROVED' ? 'approval.approved' : 'approval.rejected',
        payload: { approvalId, decision },
        producer: 'ApprovalService',
      }),
    );
  }
}
