# Folder Structure Spec

This document details the concrete physical workspace layout and file conventions for CommandOS. The file layout strictly mirrors the 5-layer dependency-inversion architecture.

## 1. Directory Tree Layout

```
command-os/
├── docs/                      # Spec-Driven Development (SDD) Documents
│   ├── 02-System-Architecture.md
│   ├── 04-Folder-Structure.md
│   ├── 05-Database-Schema.md
│   ├── 07-Rule-Engine.md
│   └── 10-Command-System.md
├── src/                       # Source Code Root
│   ├── control/               # Layer 1: Control Layer
│   │   ├── api/               # API Controllers and Gateway Routers
│   │   ├── auth/              # Authentication & Authorization Middleware
│   │   └── command-engine/    # Command Router Registry and Dispatcher
│   ├── orchestration/         # Layer 2: Orchestration Layer
│   │   ├── workflow/          # Workflow Coordinator and State Machines
│   │   └── queue/             # Redis/BullMQ Task Queue & Scheduler
│   ├── evaluation/            # Layer 3: Evaluation Layer
│   │   ├── rules/             # Rule Engine Evaluator & JSON Schema Definitions
│   │   └── validators/        # Strict Schema Validators (e.g. Zod schemas)
│   ├── domain/                # Layer 4: Domain Layer
│   │   └── modules/           # Pluggable Core Modules
│   │       ├── career/        # Career Domain Module (e.g. job search, profile sync)
│   │       │   ├── skills/    # Module-specific Pluggable Skills
│   │       │   │   └── sync-linkedin/
│   │       │   │       ├── sync-linkedin.skill.ts
│   │       │   │       └── sync-linkedin.test.ts
│   │       │   └── career.module.ts
│   │       └── development/   # Development Domain Module (e.g. code generation)
│   │           ├── skills/
│   │           │   └── generate-boilerplate/
│   │           │       └── generate-boilerplate.skill.ts
│   │           └── development.module.ts
│   ├── infrastructure/        # Layer 5: Infrastructure Layer
│   │   ├── ai/                # ModelRouter, LLM Providers (Gemini, Ollama, OpenAI)
│   │   ├── database/          # SQLite Connection Pool, Knex config, migrations
│   │   ├── cache/             # Redis Connection Client
│   │   └── services/          # HTTP clients, Logging Service, System Event Bus
│   ├── app.ts                 # Application Entry Point
│   └── config.ts              # Configuration Loader (dotenv-based)
├── database/                  # Local Database Store & Migrations
│   ├── migrations/            # SQL migration files
│   └── dev.sqlite3            # SQLite development database file (git-ignored)
├── tests/                     # Global/Integration Testing Suite
├── package.json
├── tsconfig.json
└── README.md
```

## 2. Layer Description and Directory Roles

### 1. Control Layer (`src/control/`)
* **API Gateway & Auth:** Receives incoming HTTP requests/webhooks, validates auth headers, and normalizes them.
* **Command Engine:** Parses directives and maps them to target domain handlers. Features: Zero direct access to workflows or database.

### 2. Orchestration Layer (`src/orchestration/`)
* **Workflow Engine:** Coordinates sequential, branching, or parallel task steps. Maps execution context between skills.
* **Queue & Scheduler:** Persists tasks in Redis (e.g., BullMQ) for asynchronous worker processing.

### 3. Evaluation Layer (`src/evaluation/`)
* **Rule Engine:** Contains pure, stateless functions (`RuleEngineEvaluator`) to filter, rate, or condition-gate ingested data. No database dependencies.

### 4. Domain Layer (`src/domain/`)
* **Modules:** Represent bounded business contexts (e.g., Career, Development). Each module acts as a sub-registry exposing a set of commands and workflows.
* **Pluggable Skills:** Atomic executable units containing the specific logic (e.g. web scraping, generating files). They consume frozen objects and produce new frozen outputs.

### 5. Infrastructure Layer (`src/infrastructure/`)
* **AI Router:** Low-level fallback logic for model swapping (e.g. Claude to Gemini Flash).
* **Database & Cache clients:** Direct database query handlers, caching libraries, and system logger.

---

## 3. Strict Naming Conventions

To ensure uniform code maintenance, files must follow strict postfix naming conventions matching their role and layer:

| File Type | Postfix Pattern | Example File Path |
| --- | --- | --- |
| **Command Router** | `*.router.ts` | `src/control/command-engine/command.router.ts` |
| **Workflow** | `*.workflow.ts` | `src/orchestration/workflow/job-application.workflow.ts` |
| **Rule Handler** | `*.rule.ts` | `src/evaluation/rules/salary-filter.rule.ts` |
| **Module Entry** | `*.module.ts` | `src/domain/modules/career/career.module.ts` |
| **Skill Execution** | `*.skill.ts` | `src/domain/modules/career/skills/sync-linkedin/sync-linkedin.skill.ts` |
| **Infrastructure Service** | `*.service.ts` | `src/infrastructure/ai/model-router.service.ts` |
| **TypeScript Definition** | `*.types.ts` | `src/domain/modules/career/career.types.ts` |
| **Unit / Integration Test** | `*.test.ts` | colocated next to source (e.g., `sync-linkedin.test.ts`) |

---

## 4. Downward-Only Boundary Rules

1. **Strict Import Order:**
   * A file inside `src/control/` can import from `src/orchestration/`, `src/evaluation/`, `src/domain/`, and `src/infrastructure/`.
   * A file inside `src/domain/` **must never** import from `src/control/` or `src/orchestration/`.
   * A file inside `src/infrastructure/` **must never** import from any layer above it.
2. **Pluggable Skills Isolation:**
   * Each skill folder (e.g. `src/domain/modules/career/skills/sync-linkedin/`) must be entirely self-contained. It can import from `src/infrastructure/` (e.g., LLM services, HTTP clients) but should not import from other skills.
   * If two skills share helper logic, that logic must be refactored into the module layer root (e.g. `src/domain/modules/career/career.helpers.ts`) or `src/infrastructure/services/`.
