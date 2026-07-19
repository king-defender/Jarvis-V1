# Approval Engine Spec

The Approval Engine coordinates human-in-the-loop validations, halting high-risk commands (e.g. sending outbound emails or making financial actions) until a user reviews and approves them.

---

## 1. Approval States & Lifecycle

```
             [ Action Intercepted ]
                       │
                       ▼
             ┌───────────────────┐
             │  PENDING_REVIEW   │
             └─────────┬─────────┘
                       │ User Response
             ┌─────────┴─────────┐
             ▼                   ▼
       ┌───────────┐       ┌───────────┐
       │ APPROVED  │       │ REJECTED  │
       └─────┬─────┘       └─────┬─────┘
             │                   │
             ▼                   ▼
      [ Resume Action ]   [ Abort/Rollback ]
```

---

## 2. Policy Configurations Schema

Policies are written as Zod-validated rule objects within the database or configurations to intercept execution:

```typescript
export interface ApprovalPolicy {
  id: string;
  commandPattern: string;    // E.g., "communication.send-email", "career.*"
  criteriaRuleGroupId?: string; // Optional Rule Engine check (e.g., if salary > 150k, approve)
  notificationChannel: 'slack' | 'email' | 'dashboard';
  autoApproveTimeoutMs?: number; // Optional auto-timeout
}
```

---

## 3. Human Review Prompts & Release Hooks

* **Prompt Payloads:** When a command matches an approval policy, the engine creates an entry in the `pending_approvals` database and triggers a notification.
  
```typescript
export interface PendingApprovalRequest {
  approvalId: string;
  transactionId: string;
  command: string;
  payloadToApprove: Record<string, any>;
  promptText: string;
}
```

* **Interactive Release Webhooks:** The dashboard exposes a secure controller endpoint `/api/approvals/:id/resolve`:
  * If resolved with `status = 'APPROVED'`, the engine updates the database, loads the saved context, and dispatches the command.
  * If resolved with `status = 'REJECTED'`, the engine sets the active workflow to `FAILED` or triggers compensating actions.
