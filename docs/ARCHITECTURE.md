# AgentDesk — Architecture & Engineering Reference

## 1. System Architecture Diagram

```mermaid
flowchart TB
  subgraph Client["React 19 + TypeScript Frontend (apps/web)"]
    UI["Developer Dashboard Pages\n(Overview, Projects, Tasks, Runs, Providers, Settings)"]
    RQ["TanStack Query + SSE EventSource Client"]
    RHF["React Hook Form + Zod Client Validation"]
    UI --> RQ
    UI --> RHF
  end

  subgraph Server["Node.js + Express REST API (apps/api)"]
    MW["Security Middleware\n(Helmet, Narrow CORS, JSON Limit, Zod Validation, Error Redaction)"]
    CTRL["REST Controllers\n(/api/projects, /api/tasks, /api/runs, /api/providers, /api/settings)"]
    SVC["RunService Orchestrator\n(State Machine + SSE EventEmitter Bus)"]
    REG["ProviderRegistry\n(Adapter Resolution & Verification Gate)"]
    REPO["Repositories\n(Project, Task, Provider, Run, Activity, Settings)"]
    DB[("Local SQLite Database\n(WAL Mode + Foreign Keys + Transactions)")]
  end

  subgraph Providers["Agent Provider Adapters (apps/api/src/agents/adapters)"]
    DEMO["DemoAgentProvider ('demo-agent')\nMulti-stage deterministic simulator\n(Zero API keys, no file edits)"]
    LOCAL["LocalWorkspaceCliProvider ('local-workspace-cli')\nchild_process.spawn('node', [...])\nRead-only Git & Workspace Inspector"]
    CLAUDE["ClaudeCodeCliProvider ('claude-code-cli')\nchild_process.spawn('claude', [...])\nExternal Coding Agent CLI Adapter"]
  end

  RQ <-->|"HTTP JSON + SSE (/api/runs/:id/events)"| MW
  MW --> CTRL
  CTRL --> SVC
  CTRL --> REPO
  SVC --> REG
  SVC --> REPO
  REPO --> DB
  REG --> DEMO
  REG --> LOCAL
  REG --> CLAUDE
```

---

## 2. Database Schema & Entity-Relationship Diagram

```mermaid
erDiagram
  PROJECTS ||--o{ TASKS : "has (ON DELETE CASCADE)"
  PROJECTS ||--o{ AGENT_RUNS : "tracks (ON DELETE CASCADE)"
  TASKS ||--o{ AGENT_RUNS : "executes (ON DELETE CASCADE)"
  AGENT_PROVIDERS ||--o{ AGENT_RUNS : "processes"
  AGENT_RUNS ||--o{ RUN_LOGS : "emits (ON DELETE CASCADE)"
  PROJECTS ||--o{ ACTIVITY_EVENTS : "snapshots"

  PROJECTS {
    text id PK
    text name
    text description
    text local_path
    text git_repo_url
    text default_branch
    text language
    text framework
    text tags_json
    int archived
    text default_provider_id
    text agent_instructions
    text created_at
    text updated_at
  }

  TASKS {
    text id PK
    text project_id FK
    text title
    text description
    text status
    text priority
    text labels_json
    text agent_instructions
    text acceptance_criteria_json
    text due_date
    text preferred_provider_id
    text estimated_complexity
    text created_at
    text updated_at
    text completed_at
  }

  AGENT_PROVIDERS {
    text id PK
    text name
    text kind
    text description
    int enabled
    int is_verified
    text last_verified_at
    text last_error
    text config_json
    text created_at
    text updated_at
  }

  AGENT_RUNS {
    text id PK
    text project_id FK
    text task_id FK
    text provider_id FK
    text execution_mode
    text status
    text instructions_snapshot
    text current_stage
    text latest_message
    text started_at
    text ended_at
    int duration_ms
    text summary
    text error_message
    int exit_code
    text cancelled_at
    text cancellation_reason
    text retry_of_run_id
    text config_snapshot_json
    text created_at
  }

  RUN_LOGS {
    text id PK
    text run_id FK
    int sequence
    text timestamp
    text level
    text event_type
    text message
    text metadata_json
  }

  ACTIVITY_EVENTS {
    text id PK
    text event_type
    text entity_type
    text entity_id
    text project_id
    text project_name_snapshot
    text title
    text description
    text metadata_json
    text created_at
  }

  APP_SETTINGS {
    text key PK
    text value_json
    text updated_at
  }
```

---

## 3. Agent Run State Machine

Every `AgentRun` follows a strictly enforced lifecycle state machine (`assertValidRunStatusTransition` in `apps/api/src/validators/schemas.ts`):

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> starting
  queued --> cancelled
  queued --> failed
  queued --> timed_out
  starting --> running
  starting --> cancelled
  starting --> failed
  starting --> timed_out
  running --> completed
  running --> failed
  running --> cancelled
  running --> timed_out
  completed --> [*]
  failed --> [*]
  cancelled --> [*]
  timed_out --> [*]
```

Terminal states (`completed`, `failed`, `cancelled`, `timed_out`) cannot transition back to active states. Retrying a run creates a **new** `AgentRun` record with `retry_of_run_id` referencing the prior run, preserving the full historical audit trail and logs.
