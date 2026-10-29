import path from "node:path";
import { env } from "../../config/env.js";
import { activityRepository } from "../../repositories/activity-repository.js";
import { projectRepository } from "../../repositories/project-repository.js";
import { runRepository } from "../../repositories/run-repository.js";
import { taskRepository } from "../../repositories/task-repository.js";
import { getSqlite, withTransaction } from "../client.js";

export interface SeedSummary {
  projectsCreated: number;
  tasksCreated: number;
  runsCreated: number;
  alreadySeeded: boolean;
}

export interface RemoveSeedSummary {
  projectsRemoved: number;
  tasksRemoved: number;
  runsRemoved: number;
  activityRemoved: number;
}

export const DEMO_PROJECT_IDS = [
  "proj_demo_taskflow",
  "proj_demo_repopulse",
  "proj_demo_notes",
] as const;

export const DEMO_TASK_IDS = [
  "task_demo_validation",
  "task_demo_pagination",
  "task_demo_state_transition",
  "task_demo_empty_state",
  "task_demo_integration_tests",
] as const;

export const DEMO_RUN_IDS = [
  "run_demo_completed_01",
  "run_demo_failed_02",
] as const;

export function seedDemonstrationData(): SeedSummary {
  const sqlite = getSqlite();

  let projectsCreated = 0;
  let tasksCreated = 0;
  let runsCreated = 0;

  const existingTaskflow = projectRepository.findById("proj_demo_taskflow");
  const existingRepopulse = projectRepository.findById("proj_demo_repopulse");
  const existingNotes = projectRepository.findById("proj_demo_notes");

  if (existingTaskflow && existingRepopulse && existingNotes) {
    return {
      projectsCreated: 0,
      tasksCreated: 0,
      runsCreated: 0,
      alreadySeeded: true,
    };
  }

  const workspaceRoot = path.resolve(env.APPROVED_WORKSPACE_ROOT);

  if (!existingTaskflow) {
    projectRepository.create(
      {
        name: "TaskFlow API [Demo]",
        description:
          "Demonstration project: REST API service for collaborative developer task management, validation pipelines, and webhook delivery.",
        localPath: workspaceRoot,
        gitRepoUrl: "https://github.com/example-org/taskflow-api",
        defaultBranch: "main",
        language: "TypeScript",
        framework: "Express + SQLite",
        tags: ["demo-dataset", "rest-api", "backend", "typescript"],
        archived: false,
        defaultProviderId: "demo-agent",
        agentInstructions:
          "Enforce strict Zod validation on all incoming payloads, maintain 100% parameter binding in SQL queries, and include integration tests.",
      },
      "proj_demo_taskflow"
    );
    projectsCreated++;
  }

  if (!existingRepopulse) {
    projectRepository.create(
      {
        name: "RepoPulse [Demo]",
        description:
          "Demonstration project: Repository analytics and commit velocity dashboard with customizable filter views.",
        localPath: workspaceRoot,
        gitRepoUrl: "https://github.com/example-org/repopulse",
        defaultBranch: "main",
        language: "TypeScript",
        framework: "React + Vite",
        tags: ["demo-dataset", "dashboard", "frontend", "analytics"],
        archived: false,
        defaultProviderId: "demo-agent",
        agentInstructions:
          "Follow dark-first design tokens, ensure keyboard accessibility on all filter controls, and avoid unnecessary re-renders.",
      },
      "proj_demo_repopulse"
    );
    projectsCreated++;
  }

  if (!existingNotes) {
    projectRepository.create(
      {
        name: "Notes Engine [Demo]",
        description:
          "Demonstration project: Local-first markdown note indexing engine with full-text search and tag hierarchies.",
        localPath: null,
        gitRepoUrl: "https://github.com/example-org/notes-engine",
        defaultBranch: "develop",
        language: "TypeScript",
        framework: "Node.js",
        tags: ["demo-dataset", "local-first", "search", "cli"],
        archived: false,
        defaultProviderId: "demo-agent",
        agentInstructions:
          "Keep zero external runtime dependencies for core indexing and ensure deterministic sorting on tie-breaker fields.",
      },
      "proj_demo_notes"
    );
    projectsCreated++;
  }

  const demoTasks = [
    {
      id: "task_demo_validation",
      projectId: "proj_demo_taskflow",
      title: "Add server-side request validation",
      description:
        "Implement strict Zod request body and query parameter validation middleware across all task and project endpoints.",
      status: "done" as const,
      priority: "high" as const,
      labels: ["security", "validation", "api"],
      agentInstructions:
        "Validate request payloads with Zod, return structured 400 VALIDATION_ERROR responses with field details, and strip unknown keys.",
      acceptanceCriteria: [
        "All POST and PATCH endpoints validate request bodies with Zod schemas.",
        "Invalid fields return HTTP 400 with field-level error descriptions.",
        "Raw stack traces are never exposed in error payloads.",
        "Unit and integration tests verify rejection of malformed inputs.",
      ],
      dueDate: "2026-11-05",
      preferredProviderId: "demo-agent",
      estimatedComplexity: "medium" as const,
    },
    {
      id: "task_demo_pagination",
      projectId: "proj_demo_taskflow",
      title: "Add API pagination",
      description:
        "Support bounded limit and page query parameters on collection endpoints to prevent loading unbounded histories into memory.",
      status: "in_review" as const,
      priority: "medium" as const,
      labels: ["performance", "api", "database"],
      agentInstructions:
        "Add page and limit query parameters with sensible defaults and return total count and totalPages metadata.",
      acceptanceCriteria: [
        "GET /api/runs and GET /api/tasks accept page and limit parameters.",
        "Responses include total, page, limit, and totalPages.",
        "Out-of-range limit values are rejected by query validation.",
      ],
      dueDate: "2026-11-10",
      preferredProviderId: "demo-agent",
      estimatedComplexity: "small" as const,
    },
    {
      id: "task_demo_state_transition",
      projectId: "proj_demo_taskflow",
      title: "Fix an invalid task status transition",
      description:
        "Investigate and resolve an issue where terminal run records could be transitioned back into a running state.",
      status: "in_progress" as const,
      priority: "urgent" as const,
      labels: ["bug", "state-machine", "reliability"],
      agentInstructions:
        "Enforce a strict state machine for run status transitions so completed, failed, cancelled, and timed_out states are terminal.",
      acceptanceCriteria: [
        "State machine explicitly defines allowed transitions for each status.",
        "Attempting an invalid transition throws a descriptive error.",
        "Unit tests cover valid and invalid status transitions.",
      ],
      dueDate: "2026-10-28",
      preferredProviderId: "demo-agent",
      estimatedComplexity: "medium" as const,
    },
    {
      id: "task_demo_empty_state",
      projectId: "proj_demo_repopulse",
      title: "Improve the empty state for project search",
      description:
        "Design a clear empty-result view when search queries or tag filters match zero projects, including a one-click reset action.",
      status: "todo" as const,
      priority: "medium" as const,
      labels: ["ux", "frontend", "search"],
      agentInstructions:
        "Show an informative empty state when no projects match active search or filter criteria and provide a 'Reset Filters' button.",
      acceptanceCriteria: [
        "Users can search by project name or description.",
        "Search is case-insensitive.",
        "An empty result state is shown when nothing matches.",
        "Existing project filters continue to work.",
      ],
      dueDate: "2026-11-12",
      preferredProviderId: "demo-agent",
      estimatedComplexity: "small" as const,
    },
    {
      id: "task_demo_integration_tests",
      projectId: "proj_demo_notes",
      title: "Write integration tests for task creation",
      description:
        "Create isolated API integration tests verifying task creation, project association, and validation failure handling.",
      status: "backlog" as const,
      priority: "low" as const,
      labels: ["testing", "qa"],
      agentInstructions:
        "Use Supertest against an isolated test SQLite database to verify POST /api/tasks and GET /api/tasks.",
      acceptanceCriteria: [
        "Tests run against an isolated database without touching local development data.",
        "Valid task creation persists to SQLite and increments project task count.",
        "Missing title or invalid projectId returns appropriate HTTP 400/404 status.",
      ],
      dueDate: "2026-11-20",
      preferredProviderId: "demo-agent",
      estimatedComplexity: "medium" as const,
    },
  ];

  for (const t of demoTasks) {
    if (!taskRepository.findById(t.id)) {
      taskRepository.create(t, t.id);
      tasksCreated++;
    }
  }

  if (!runRepository.findById("run_demo_completed_01")) {
    const startIso = new Date(Date.now() - 1000 * 60 * 25).toISOString();
    const endIso = new Date(Date.now() - 1000 * 60 * 25 + 4200).toISOString();

    sqlite
      .prepare(
        `INSERT INTO agent_runs (
          id, project_id, task_id, provider_id, execution_mode, status,
          instructions_snapshot, current_stage, latest_message,
          started_at, ended_at, duration_ms, summary, error_message,
          exit_code, config_snapshot_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "run_demo_completed_01",
        "proj_demo_taskflow",
        "task_demo_validation",
        "demo-agent",
        "demo",
        "completed",
        "Validate request payloads with Zod, return structured 400 VALIDATION_ERROR responses with field details, and strip unknown keys.",
        "Completed",
        "[SIMULATED DEMO] Completed simulated workflow for 'Add server-side request validation' across 6 stages. No real files were modified.",
        startIso,
        endIso,
        4200,
        "[SIMULATED DEMO] Completed simulated workflow for 'Add server-side request validation' across 6 stages. No real files were modified.",
        null,
        0,
        JSON.stringify({
          providerKind: "demo",
          isSimulated: true,
          workingDirectory: "(virtual)",
          simulatedOutcome: "completed",
        }),
        startIso
      );

    const completedLogs = [
      {
        level: "info" as const,
        eventType: "run.queued",
        message:
          "[SIMULATED DEMO] Queued run run_demo_completed_01 for task 'Add server-side request validation' using AgentDesk Demo Simulator.",
      },
      {
        level: "info" as const,
        eventType: "simulated.init",
        message:
          "[SIMULATED DEMO] Initializing demo execution for task 'Add server-side request validation' in project 'TaskFlow API [Demo]'.",
      },
      {
        level: "info" as const,
        eventType: "simulated.validate",
        message:
          "[SIMULATED DEMO] Validated task instructions and 4 acceptance criteria item(s).",
      },
      {
        level: "debug" as const,
        eventType: "simulated.workspace",
        message: "[SIMULATED DEMO] Prepared isolated in-memory workspace snapshot.",
      },
      {
        level: "info" as const,
        eventType: "simulated.verify",
        message:
          "[SIMULATED DEMO] Verified all 4 acceptance check(s) in simulated runner (exit code 0).",
      },
      {
        level: "info" as const,
        eventType: "simulated.complete",
        message:
          "[SIMULATED DEMO] Completed simulated workflow for 'Add server-side request validation' across 6 stages. No real files were modified.",
      },
    ];

    for (const log of completedLogs) {
      runRepository.appendLog({
        runId: "run_demo_completed_01",
        timestamp: startIso,
        level: log.level,
        eventType: log.eventType,
        message: log.message,
        metadata: { simulated: true },
      });
    }

    activityRepository.record({
      eventType: "run.completed",
      entityType: "run",
      entityId: "run_demo_completed_01",
      projectId: "proj_demo_taskflow",
      projectNameSnapshot: "TaskFlow API [Demo]",
      title: "[Simulated] Run run_demo_completed_01 completed (Add server-side request validation)",
      description: "[SIMULATED DEMO] Completed simulated workflow with exit code 0.",
      metadata: {
        isSimulated: true,
        executionMode: "demo",
        demoDataset: true,
      },
      createdAt: endIso,
    });
    runsCreated++;
  }

  if (!runRepository.findById("run_demo_failed_02")) {
    const startIso = new Date(Date.now() - 1000 * 60 * 10).toISOString();
    const endIso = new Date(Date.now() - 1000 * 60 * 10 + 3100).toISOString();

    sqlite
      .prepare(
        `INSERT INTO agent_runs (
          id, project_id, task_id, provider_id, execution_mode, status,
          instructions_snapshot, current_stage, latest_message,
          started_at, ended_at, duration_ms, summary, error_message,
          exit_code, config_snapshot_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "run_demo_failed_02",
        "proj_demo_taskflow",
        "task_demo_state_transition",
        "demo-agent",
        "demo",
        "failed",
        "Enforce a strict state machine for run status transitions so completed, failed, cancelled, and timed_out states are terminal. [simulate:fail]",
        "Simulated Validation Step",
        "Simulated verification check failed at stage 'Simulated Validation Step' with exit code 1.",
        startIso,
        endIso,
        3100,
        "Simulated run terminated during validation step (configured to demonstrate failure handling).",
        "Simulated verification check failed at stage 'Simulated Validation Step' with exit code 1.",
        1,
        JSON.stringify({
          providerKind: "demo",
          isSimulated: true,
          workingDirectory: "(virtual)",
          simulatedOutcome: "failed",
        }),
        startIso
      );

    const failedLogs = [
      {
        level: "info" as const,
        eventType: "run.queued",
        message:
          "[SIMULATED DEMO] Queued run run_demo_failed_02 for task 'Fix an invalid task status transition'.",
      },
      {
        level: "info" as const,
        eventType: "simulated.init",
        message:
          "[SIMULATED DEMO] Initializing demo execution for task 'Fix an invalid task status transition'.",
      },
      {
        level: "warn" as const,
        eventType: "simulated.validation_warning",
        message:
          "[SIMULATED DEMO] Warning: Simulated validation check detected an unmet acceptance criterion.",
      },
      {
        level: "error" as const,
        eventType: "simulated.error",
        message:
          "[SIMULATED DEMO] Simulated verification step failed with exit code 1 (assertion mismatch in simulated test suite).",
      },
    ];

    for (const log of failedLogs) {
      runRepository.appendLog({
        runId: "run_demo_failed_02",
        timestamp: startIso,
        level: log.level,
        eventType: log.eventType,
        message: log.message,
        metadata: { simulated: true, failedStage: "Simulated Validation Step" },
      });
    }

    activityRepository.record({
      eventType: "run.failed",
      entityType: "run",
      entityId: "run_demo_failed_02",
      projectId: "proj_demo_taskflow",
      projectNameSnapshot: "TaskFlow API [Demo]",
      title: "[Simulated] Run run_demo_failed_02 failed (Fix an invalid task status transition)",
      description:
        "Simulated verification check failed at stage 'Simulated Validation Step' with exit code 1.",
      metadata: {
        isSimulated: true,
        executionMode: "demo",
        demoDataset: true,
      },
      createdAt: endIso,
    });
    runsCreated++;
  }

  return {
    projectsCreated,
    tasksCreated,
    runsCreated,
    alreadySeeded: false,
  };
}

/**
 * Safely removes only seeded demonstration records (`proj_demo_*`, `task_demo_*`, `run_demo_*`,
 * and projects tagged with `"demo-dataset"`) without touching any genuine user-created records.
 */
export function removeDemonstrationData(): RemoveSeedSummary {
  return withTransaction((sqlite) => {
    const demoProjects = sqlite
      .prepare(
        `SELECT id FROM projects
         WHERE id IN ('proj_demo_taskflow', 'proj_demo_repopulse', 'proj_demo_notes')
            OR tags_json LIKE '%"demo-dataset"%'`
      )
      .all() as unknown as Array<{ id: string }>;

    const projectIds = demoProjects.map((p) => p.id);

    let tasksRemoved = 0;
    let runsRemoved = 0;
    let projectsRemoved = 0;

    if (projectIds.length > 0) {
      const placeholders = projectIds.map(() => "?").join(", ");
      const taskCount = sqlite
        .prepare(`SELECT COUNT(*) AS count FROM tasks WHERE project_id IN (${placeholders})`)
        .get(...projectIds) as unknown as { count: number };
      const runCount = sqlite
        .prepare(`SELECT COUNT(*) AS count FROM agent_runs WHERE project_id IN (${placeholders})`)
        .get(...projectIds) as unknown as { count: number };

      tasksRemoved = Number(taskCount?.count ?? 0);
      runsRemoved = Number(runCount?.count ?? 0);

      const delProj = sqlite
        .prepare(`DELETE FROM projects WHERE id IN (${placeholders})`)
        .run(...projectIds);
      projectsRemoved = Number(delProj.changes ?? 0);
    }

    const delAct = sqlite
      .prepare(
        `DELETE FROM activity_events
         WHERE project_id IN ('proj_demo_taskflow', 'proj_demo_repopulse', 'proj_demo_notes')
            OR entity_id LIKE 'proj_demo_%'
            OR entity_id LIKE 'task_demo_%'
            OR entity_id LIKE 'run_demo_%'`
      )
      .run();

    return {
      projectsRemoved,
      tasksRemoved,
      runsRemoved,
      activityRemoved: Number(delAct.changes ?? 0),
    };
  });
}
