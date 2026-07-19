# Plugin System Spec

The Plugin System enables developers to extend CommandOS by hot-loading modules, commands, events, and database migration configurations.

---

## 1. Plugin Manifest Schema

Plugins are defined by a static JSON manifest file (`manifest.json`):

```json
{
  "id": "commandos-slack-plugin",
  "name": "Slack Integration",
  "version": "1.0.0",
  "description": "Send notifications and run commands from Slack channels",
  "entry": "./dist/index.js",
  "dependencies": {
    "commandos-core": "^1.0.0"
  },
  "permissions": [
    "network.request",
    "cache.read",
    "cache.write"
  ],
  "exports": {
    "commands": [
      "slack.post-message",
      "slack.invite-user"
    ],
    "events": [
      "slack.message_received"
    ]
  }
}
```

---

## 2. Plugin Lifecycle

```
    [ LOADED ] ──> [ INITIALIZED ] ──> [ ACTIVE ]
                         │                  │
                         ▼                  ▼
                    [ DISABLED ] ────> [ SHUTDOWN ]
```

* **LOADED:** The runner reads the plugin manifest, checks node version compatibilities, and validates dependencies.
* **INITIALIZED:** DB schema expansions and tables migrations are applied; services are registered.
* **ACTIVE:** Command routing handlers are mapped, and subscriptions to the Event Bus become active.
* **DISABLED:** Telemetry, triggers, and command handlers are detached from routing maps temporarily.
* **SHUTDOWN:** Active resources (connections, browser contexts) are closed; files are unlinked.

---

## 3. Plugin Registration API & Sandbox Rules

Plugins interact with CommandOS through a protected runtime API interface:

```typescript
export interface PluginContext {
  registerCommand(name: string, schema: any, handler: any): void;
  subscribeToEvent(name: string, handler: any): void;
  getService<T>(serviceName: string): T; // Fetch database, cache, or http services
  logger: any;
}

export interface ICommandOSPlugin {
  initialize(context: PluginContext): Promise<void>;
  shutdown(): Promise<void>;
}
```

### Sandboxing Constraints:
1. **Network Restraints:** Plugins cannot spawn direct socket listeners unless specified in permissions.
2. **Filesystem Locks:** Plugins must use the provided Filesystem Service wrapper; direct imports of Node's `fs` or `child_process` modules are strictly prohibited.
