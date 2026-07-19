# Command System (Command Resolution)

## 1. Unified Command Router Architecture

The Command Engine is the entry point for system execution. It maps all ingress points (REST API endpoints, webhooks, scheduling cron triggers, or text input interfaces) down into a single execution registry payload format known as a **System Command Directive**.

```
[ HTTP POST /api/command ] ──┐
[ System Scheduler Cron  ] ──┼─> [ CommandEngine Router ] ──> [ Target Domain Module ]
[ Slack/CLI Context      ] ──┘
```

## 2. The Strict System Command Registry Schema

```typescript
export interface SystemCommandDirective<T = Record<string, any>> {
  transactionId: string;       // Unique UUIDv4 tracking identifier
  command: string;             // Namespaced action path: "domain.action"
  timestamp: string;           // ISO 8601 string execution request timestamp
  payload: T;                  // Dynamic execution arguments matching the skill contract
  context: {
    userId: string;
    triggerSource: 'CLI' | 'DASHBOARD' | 'CRON' | 'WEBHOOK';
    bypassCache: boolean;
  };
}
```

## 3. Strict Command Routing Interface Strategy

```typescript
export interface ICommandRouter {
  route(directive: SystemCommandDirective): Promise<void>;
  registerModuleCommand(commandName: string, handler: (payload: any) => Promise<any>): void;
}

// Concrete Core Routing Registry implementation
export class CommandRouter implements ICommandRouter {
  private registry: Map<string, (payload: any) => Promise<any>> = new Map();

  public registerModuleCommand(commandName: string, handler: (payload: any) => Promise<any>): void {
    if (this.registry.has(commandName)) {
      throw new Error(`Command registration conflict detected for path: ${commandName}`);
    }
    this.registry.set(commandName, handler);
  }

  public async route(directive: SystemCommandDirective): Promise<any> {
    const handler = this.registry.get(directive.command);
    if (!handler) {
      throw new Error(`Command execution error: ${directive.command} is not a valid endpoint.`);
    }
    
    // Performance metrics and execution tracking hooked directly here
    console.log(`[Transaction: ${directive.transactionId}] Executing: ${directive.command}`);
    return await handler(directive.payload);
  }
}
```
