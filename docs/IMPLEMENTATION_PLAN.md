# AgentDesk — Technical Implementation Plan (Phase 1)

## 1. Environment Inspection Summary
- **OS:** Windows (`win32`)
- **Node.js:** `v24.16.0` (includes native `node:sqlite` support)
- **Package Manager:** `npm v11.13.0` (and `pnpm v10.27.0` available)
- **Git:** `git.exe` installed and clean repository initialized on `master`
- **Local Coding Agent CLIs:** Neither `claude` nor `aider` is currently installed on the global system `PATH`. `node` and `git` are available on `PATH`.
- **Environmental Blockers:** None. All required ports, local filesystem permissions, SQLite storage, and Node.js runtime features are available.

## 2. Architecture & Monorepo Layout
We will implement a clean modular monolith organized as an npm workspace monorepo:
- `apps/api`: Express + TypeScript REST API, SQLite persistence layer, Zod request/query validation, structured logger, SSE/live event streaming, and the Agent Provider Registry & Adapters.
- `apps/web`: React 19 + TypeScript + Vite + Tailwind CSS + TanStack Query + React Hook Form + Zod + Lucide Icons developer dashboard.
- `docs/`: Architecture overview, ER diagram, OpenAPI/REST API reference, and screenshot assets.
- `tests/`: End-to-end Playwright / full-stack integration verification suites.

## 3. Database & ORM Strategy
- **Database Engine:** Local persistent SQLite database file (`apps/api/data/agentdesk.sqlite` in normal operation; isolated temporary file or `:memory:` during automated tests).
- **ORM & Schema:** Drizzle ORM (`drizzle-orm`) with versioned SQL migrations (`apps/api/src/database/migrations`) and deterministic, idempotent seed script (`apps/api/src/database/seed`).
- **Core Entities:**
  1. `projects` — Workspace metadata, local path, git repo URL, branch, language, framework, JSON tags, default provider, agent instructions, archived flag, timestamps.
  2. `tasks` — Project-linked tasks with status (`backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled`), priority (`low`, `medium`, `high`, `urgent`), JSON labels, JSON acceptance criteria array, agent instructions, complexity, due date, preferred provider, timestamps.
  3. `agent_providers` — Provider metadata (`id`, `name`, `kind`: `demo` | `local_cli`, `enabled`, `is_verified`, `last_verified_at`, `last_error`, `config_json` with non-secret settings).
  4. `agent_runs` — Execution record linking project, task, and provider, tracking `execution_mode` (`demo` | `local`), strict status state machine (`queued` -> `starting` -> `running` -> `completed` | `failed` | `cancelled` | `timed_out`), instructions snapshot, `retry_of_run_id`, timestamps, duration_ms, summary, error_message, exit_code, and config metadata.
  5. `run_logs` — Ordered structured events (`id`, `run_id`, `timestamp`, `level`: `debug` | `info` | `warn` | `error`, `event_type`, `message`, `metadata_json`).
  6. `activity_events` — Persistent audit/activity stream with historical snapshots so renaming/deleting items preserves readable context.
  7. `app_settings` — Key-value persistent preferences (theme, default sort, default provider, default execution mode, approved workspace root, destructive action confirmations, log preferences).

## 4. Provider System & Security Controls
- **Provider Interface (`AgentProvider`):** Standardized `validateConfiguration()`, `execute(input, emit, signal)`, and `cancel(runId)` contract.
- **Adapters:**
  1. `demo-agent` (`kind: "demo"`): Multi-stage realistic simulator with configurable outcome (success, failure, timeout) and instant cancellation support. Explicitly badged as `SIMULATED DEMO`.
  2. `local-workspace-cli` (`kind: "local_cli"`): Real local process adapter using `child_process.spawn` (argument array only, zero shell interpolation) executing a read-only local repository diagnostic/verification workflow (`git status`, file structure check, TypeScript/JSON validation) inside verified workspace paths.
  3. `claude-code-cli` (`kind: "local_cli"`): Real CLI adapter for Anthropic's `claude` CLI binary. Performs genuine binary verification on `PATH` via `spawn` and reports clear prerequisite diagnostics when the binary is absent.
- **Security Guardrails:**
  - Strict workspace path confinement (`path.resolve` + prefix verification against `approvedWorkspaceRoot`).
  - Secret redaction utility scrubbing API keys, bearer tokens, and sensitive env strings from logs and errors.
  - Narrow CORS policy, Helmet security headers, JSON body size limits, and centralized error middleware that never leaks stack traces.
