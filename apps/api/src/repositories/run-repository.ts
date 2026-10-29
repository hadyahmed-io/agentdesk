import crypto from "node:crypto";
import type { z } from "zod";
import { env } from "../config/env.js";
import { getSqlite, withTransaction } from "../database/client.js";
import {
  calculateDurationMs,
  calculateSuccessRate,
  redactMetadata,
  redactSecrets,
} from "../utils/security.js";
import {
  assertValidRunStatusTransition,
  TERMINAL_RUN_STATUSES,
  type AgentRunStatus,
  type ExecutionMode,
  type LogLevel,
  type runLogsQuerySchema,
  type runQuerySchema,
} from "../validators/schemas.js";
import { activityRepository } from "./activity-repository.js";

export interface AgentRunRecord {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskTitle: string;
  providerId: string;
  providerName: string;
  providerKind: "demo" | "local_cli";
  isSimulated: boolean;
  executionMode: ExecutionMode;
  status: AgentRunStatus;
  instructionsSnapshot: string;
  currentStage: string | null;
  latestMessage: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  summary: string | null;
  errorMessage: string | null;
  exitCode: number | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  retryOfRunId: string | null;
  configSnapshot: Record<string, unknown>;
  createdAt: string;
  logCount: number;
}

export interface RunLogRecord {
  id: string;
  runId: string;
  sequence: number;
  timestamp: string;
  level: LogLevel;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface RawRunRow {
  id: string;
  project_id: string;
  project_name?: string;
  task_id: string;
  task_title?: string;
  provider_id: string;
  provider_name?: string;
  provider_kind?: "demo" | "local_cli";
  execution_mode: ExecutionMode;
  status: AgentRunStatus;
  instructions_snapshot: string;
  current_stage: string | null;
  latest_message: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  summary: string | null;
  error_message: string | null;
  exit_code: number | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  retry_of_run_id: string | null;
  config_snapshot_json: string;
  created_at: string;
  log_count?: number;
}

interface RawLogRow {
  id: string;
  run_id: string;
  sequence: number;
  timestamp: string;
  level: LogLevel;
  event_type: string;
  message: string;
  metadata_json: string | null;
}

function mapRunRow(row: RawRunRow): AgentRunRecord {
  let configSnapshot: Record<string, unknown> = {};
  try {
    configSnapshot = JSON.parse(row.config_snapshot_json || "{}");
  } catch {
    configSnapshot = {};
  }

  const computedDuration =
    row.duration_ms !== null
      ? row.duration_ms
      : calculateDurationMs(row.started_at, row.ended_at);

  const providerKind = row.provider_kind ?? (row.execution_mode === "demo" ? "demo" : "local_cli");

  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name ?? "Unknown Project",
    taskId: row.task_id,
    taskTitle: row.task_title ?? "Unknown Task",
    providerId: row.provider_id,
    providerName: row.provider_name ?? row.provider_id,
    providerKind,
    isSimulated: providerKind === "demo" || row.execution_mode === "demo",
    executionMode: row.execution_mode,
    status: row.status,
    instructionsSnapshot: row.instructions_snapshot,
    currentStage: row.current_stage,
    latestMessage: row.latest_message,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: computedDuration,
    summary: row.summary,
    errorMessage: row.error_message,
    exitCode: row.exit_code,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    retryOfRunId: row.retry_of_run_id,
    configSnapshot: redactMetadata(configSnapshot) ?? {},
    createdAt: row.created_at,
    logCount: Number(row.log_count ?? 0),
  };
}

function mapLogRow(row: RawLogRow): RunLogRecord {
  let metadata: Record<string, unknown> | undefined;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(row.metadata_json);
    } catch {
      metadata = undefined;
    }
  }
  return {
    id: row.id,
    runId: row.run_id,
    sequence: row.sequence,
    timestamp: row.timestamp,
    level: row.level,
    eventType: row.event_type,
    message: row.message,
    ...(metadata ? { metadata } : {}),
  };
}

const RUN_SELECT_ENRICHED = `
  SELECT
    r.*,
    p.name AS project_name,
    t.title AS task_title,
    ap.name AS provider_name,
    ap.kind AS provider_kind,
    (SELECT COUNT(*) FROM run_logs l WHERE l.run_id = r.id) AS log_count
  FROM agent_runs r
  JOIN projects p ON p.id = r.project_id
  JOIN tasks t ON t.id = r.task_id
  LEFT JOIN agent_providers ap ON ap.id = r.provider_id
`;

export class RunRepository {
  list(query: z.infer<typeof runQuerySchema>): {
    items: AgentRunRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const sqlite = getSqlite();
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query.status) {
      conditions.push("r.status = ?");
      params.push(query.status);
    }
    if (query.projectId) {
      conditions.push("r.project_id = ?");
      params.push(query.projectId);
    }
    if (query.taskId) {
      conditions.push("r.task_id = ?");
      params.push(query.taskId);
    }
    if (query.providerId) {
      conditions.push("r.provider_id = ?");
      params.push(query.providerId);
    }
    if (query.executionMode) {
      conditions.push("r.execution_mode = ?");
      params.push(query.executionMode);
    }
    if (query.fromDate) {
      conditions.push("r.created_at >= ?");
      params.push(query.fromDate);
    }
    if (query.toDate) {
      conditions.push("r.created_at <= ?");
      params.push(query.toDate);
    }
    if (query.search && query.search.trim().length > 0) {
      const pattern = `%${query.search.trim().toLowerCase()}%`;
      conditions.push(
        "(LOWER(r.id) LIKE ? OR LOWER(t.title) LIKE ? OR LOWER(p.name) LIKE ? OR LOWER(COALESCE(r.summary, '')) LIKE ?)"
      );
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sortDir = query.sortOrder === "asc" ? "ASC" : "DESC";

    const countRow = sqlite
      .prepare(
        `SELECT COUNT(*) AS count
         FROM agent_runs r
         JOIN projects p ON p.id = r.project_id
         JOIN tasks t ON t.id = r.task_id
         ${whereClause}`
      )
      .get(...params) as unknown as { count: number };
    const total = Number(countRow?.count ?? 0);

    const limit = query.limit ?? 30;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const rows = sqlite
      .prepare(
        `${RUN_SELECT_ENRICHED} ${whereClause} ORDER BY r.created_at ${sortDir}, r.rowid ${sortDir} LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as unknown as RawRunRow[];

    return {
      items: rows.map(mapRunRow),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  findById(id: string): AgentRunRecord | null {
    const sqlite = getSqlite();
    const row = sqlite
      .prepare(`${RUN_SELECT_ENRICHED} WHERE r.id = ?`)
      .get(id) as unknown as RawRunRow | undefined;
    return row ? mapRunRow(row) : null;
  }

  create(input: {
    id?: string;
    projectId: string;
    projectName: string;
    taskId: string;
    taskTitle: string;
    providerId: string;
    providerName: string;
    executionMode: ExecutionMode;
    instructionsSnapshot: string;
    retryOfRunId?: string | null;
    configSnapshot?: Record<string, unknown>;
  }): AgentRunRecord {
    const id = input.id ?? `run_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const safeConfig = redactMetadata(input.configSnapshot) ?? {};

    withTransaction((sqlite) => {
      sqlite
        .prepare(
          `INSERT INTO agent_runs (
            id, project_id, task_id, provider_id, execution_mode, status,
            instructions_snapshot, current_stage, latest_message,
            retry_of_run_id, config_snapshot_json, created_at
          ) VALUES (?, ?, ?, ?, ?, 'queued', ?, 'Queued', 'Run queued for execution.', ?, ?, ?)`
        )
        .run(
          id,
          input.projectId,
          input.taskId,
          input.providerId,
          input.executionMode,
          redactSecrets(input.instructionsSnapshot),
          input.retryOfRunId ?? null,
          JSON.stringify(safeConfig),
          now
        );

      const isSim = input.executionMode === "demo";
      activityRepository.record({
        eventType: "run.started",
        entityType: "run",
        entityId: id,
        projectId: input.projectId,
        projectNameSnapshot: input.projectName,
        title: `${isSim ? "[Simulated] " : ""}Run ${id} started for '${input.taskTitle}'`,
        description: `Executing with ${input.providerName} (${
          isSim ? "SIMULATED DEMO" : "LOCAL CLI"
        } mode).`,
        metadata: {
          runId: id,
          taskId: input.taskId,
          providerId: input.providerId,
          executionMode: input.executionMode,
          isSimulated: isSim,
          retryOfRunId: input.retryOfRunId ?? null,
        },
      });
    });

    return this.findById(id)!;
  }

  transitionStatus(
    id: string,
    toStatus: AgentRunStatus,
    patch: {
      currentStage?: string | null;
      latestMessage?: string | null;
      summary?: string | null;
      errorMessage?: string | null;
      exitCode?: number | null;
      cancellationReason?: string | null;
    } = {}
  ): AgentRunRecord {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Run '${id}' not found.`);
    }

    assertValidRunStatusTransition(existing.status, toStatus);

    const now = new Date().toISOString();
    const startedAt =
      existing.startedAt ??
      (toStatus === "starting" || toStatus === "running" ? now : null);
    const isTerminal = TERMINAL_RUN_STATUSES.has(toStatus);
    const endedAt = isTerminal ? existing.endedAt ?? now : existing.endedAt;
    const durationMs =
      endedAt && startedAt
        ? calculateDurationMs(startedAt, endedAt)
        : existing.durationMs;

    const cancelledAt =
      toStatus === "cancelled" ? existing.cancelledAt ?? now : existing.cancelledAt;

    withTransaction((sqlite) => {
      sqlite
        .prepare(
          `UPDATE agent_runs SET
            status = ?,
            current_stage = ?,
            latest_message = ?,
            started_at = ?,
            ended_at = ?,
            duration_ms = ?,
            summary = ?,
            error_message = ?,
            exit_code = ?,
            cancelled_at = ?,
            cancellation_reason = ?
          WHERE id = ?`
        )
        .run(
          toStatus,
          patch.currentStage !== undefined ? patch.currentStage : existing.currentStage,
          patch.latestMessage !== undefined
            ? patch.latestMessage
              ? redactSecrets(patch.latestMessage)
              : null
            : existing.latestMessage,
          startedAt,
          endedAt,
          durationMs,
          patch.summary !== undefined
            ? patch.summary
              ? redactSecrets(patch.summary)
              : null
            : existing.summary,
          patch.errorMessage !== undefined
            ? patch.errorMessage
              ? redactSecrets(patch.errorMessage)
              : null
            : existing.errorMessage,
          patch.exitCode !== undefined ? patch.exitCode : existing.exitCode,
          cancelledAt,
          patch.cancellationReason !== undefined
            ? patch.cancellationReason
            : existing.cancellationReason,
          id
        );

      if (isTerminal && existing.status !== toStatus) {
        const eventTypeMap: Record<string, string> = {
          completed: "run.completed",
          failed: "run.failed",
          cancelled: "run.cancelled",
          timed_out: "run.timed_out",
        };
        activityRepository.record({
          eventType: eventTypeMap[toStatus] ?? `run.${toStatus}`,
          entityType: "run",
          entityId: id,
          projectId: existing.projectId,
          projectNameSnapshot: existing.projectName,
          title: `${
            existing.isSimulated ? "[Simulated] " : ""
          }Run ${id} ${toStatus.replace("_", " ")} (${existing.taskTitle})`,
          description:
            patch.summary ??
            patch.errorMessage ??
            patch.cancellationReason ??
            `Run finished with status '${toStatus}'.`,
          metadata: {
            runId: id,
            status: toStatus,
            executionMode: existing.executionMode,
            isSimulated: existing.isSimulated,
            exitCode: patch.exitCode ?? existing.exitCode,
            durationMs,
          },
        });
      }
    });

    return this.findById(id)!;
  }

  updateProgress(
    id: string,
    stage: string,
    message: string
  ): void {
    const sqlite = getSqlite();
    sqlite
      .prepare(
        "UPDATE agent_runs SET current_stage = ?, latest_message = ? WHERE id = ?"
      )
      .run(stage, redactSecrets(message), id);
  }

  appendLog(input: {
    runId: string;
    timestamp?: string;
    level?: LogLevel;
    eventType: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): RunLogRecord {
    const sqlite = getSqlite();
    const id = `log_${crypto.randomUUID().slice(0, 12)}`;
    const timestamp = input.timestamp ?? new Date().toISOString();
    const level: LogLevel = input.level ?? "info";

    const maxBytes = env.MAX_LOG_PAYLOAD_BYTES;
    let safeMessage = redactSecrets(input.message || "");
    if (Buffer.byteLength(safeMessage, "utf8") > maxBytes) {
      safeMessage = safeMessage.slice(0, Math.floor(maxBytes / 2)) + " ... [TRUNCATED]";
    }

    let metadataJson: string | null = null;
    const safeMeta = redactMetadata(input.metadata);
    if (safeMeta && Object.keys(safeMeta).length > 0) {
      const serialized = JSON.stringify(safeMeta);
      if (Buffer.byteLength(serialized, "utf8") <= maxBytes) {
        metadataJson = serialized;
      } else {
        metadataJson = JSON.stringify({ truncated: true, note: "Metadata exceeded payload limit" });
      }
    }

    const seqRow = sqlite
      .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next_seq FROM run_logs WHERE run_id = ?")
      .get(input.runId) as unknown as { next_seq: number };
    const sequence = Number(seqRow?.next_seq ?? 1);

    sqlite
      .prepare(
        `INSERT INTO run_logs (
          id, run_id, sequence, timestamp, level, event_type, message, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.runId,
        sequence,
        timestamp,
        level,
        input.eventType,
        safeMessage,
        metadataJson
      );

    return {
      id,
      runId: input.runId,
      sequence,
      timestamp,
      level,
      eventType: input.eventType,
      message: safeMessage,
      ...(safeMeta ? { metadata: safeMeta } : {}),
    };
  }

  listLogs(
    runId: string,
    query: z.infer<typeof runLogsQuerySchema>
  ): {
    items: RunLogRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const sqlite = getSqlite();
    const conditions: string[] = ["run_id = ?"];
    const params: Array<string | number> = [runId];

    if (query.level) {
      conditions.push("level = ?");
      params.push(query.level);
    }

    if (query.search && query.search.trim().length > 0) {
      const pattern = `%${query.search.trim().toLowerCase()}%`;
      conditions.push("(LOWER(message) LIKE ? OR LOWER(event_type) LIKE ?)");
      params.push(pattern, pattern);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countRow = sqlite
      .prepare(`SELECT COUNT(*) AS count FROM run_logs ${whereClause}`)
      .get(...params) as unknown as { count: number };
    const total = Number(countRow?.count ?? 0);

    const limit = query.limit ?? 200;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const rows = sqlite
      .prepare(
        `SELECT * FROM run_logs ${whereClause} ORDER BY sequence ASC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as unknown as RawLogRow[];

    return {
      items: rows.map(mapLogRow),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  getMetrics(options: {
    projectId?: string;
    providerId?: string;
    days?: number;
  } = {}) {
    const sqlite = getSqlite();

    const projectStats = sqlite
      .prepare(
        `SELECT
          COUNT(*) AS total_projects,
          SUM(CASE WHEN archived = 0 THEN 1 ELSE 0 END) AS active_projects,
          SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) AS archived_projects,
          SUM(CASE WHEN id IN ('proj_demo_taskflow', 'proj_demo_repopulse', 'proj_demo_notes') OR tags_json LIKE '%"demo-dataset"%' THEN 1 ELSE 0 END) AS demo_projects
        FROM projects`
      )
      .get() as unknown as {
      total_projects: number;
      active_projects: number;
      archived_projects: number;
      demo_projects: number;
    };

    const taskConditions: string[] = [];
    const taskParams: Array<string | number> = [];
    if (options.projectId) {
      taskConditions.push("project_id = ?");
      taskParams.push(options.projectId);
    }
    const taskWhere =
      taskConditions.length > 0 ? `WHERE ${taskConditions.join(" AND ")}` : "";

    const taskStats = sqlite
      .prepare(
        `SELECT
          COUNT(*) AS total_tasks,
          SUM(CASE WHEN status IN ('backlog', 'todo', 'in_progress', 'in_review') THEN 1 ELSE 0 END) AS open_tasks,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_tasks,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS completed_tasks
        FROM tasks ${taskWhere}`
      )
      .get(...taskParams) as unknown as {
      total_tasks: number;
      open_tasks: number;
      in_progress_tasks: number;
      completed_tasks: number;
    };

    const runConditions: string[] = [];
    const runParams: Array<string | number> = [];
    if (options.projectId) {
      runConditions.push("project_id = ?");
      runParams.push(options.projectId);
    }
    if (options.providerId) {
      runConditions.push("provider_id = ?");
      runParams.push(options.providerId);
    }
    if (options.days && options.days > 0) {
      const since = new Date(Date.now() - options.days * 86400 * 1000).toISOString();
      runConditions.push("created_at >= ?");
      runParams.push(since);
    }
    const runWhere =
      runConditions.length > 0 ? `WHERE ${runConditions.join(" AND ")}` : "";

    const runStats = sqlite
      .prepare(
        `SELECT
          COUNT(*) AS total_runs,
          SUM(CASE WHEN status IN ('queued', 'starting', 'running') THEN 1 ELSE 0 END) AS active_runs,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_runs,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_runs,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_runs,
          SUM(CASE WHEN status = 'timed_out' THEN 1 ELSE 0 END) AS timed_out_runs,
          SUM(CASE WHEN execution_mode = 'demo' THEN 1 ELSE 0 END) AS simulated_runs,
          SUM(CASE WHEN execution_mode = 'local' THEN 1 ELSE 0 END) AS local_cli_runs,
          SUM(CASE WHEN status = 'completed' AND execution_mode = 'demo' THEN 1 ELSE 0 END) AS completed_simulated_runs,
          SUM(CASE WHEN status = 'completed' AND execution_mode = 'local' THEN 1 ELSE 0 END) AS completed_local_runs
        FROM agent_runs ${runWhere}`
      )
      .get(...runParams) as unknown as {
      total_runs: number;
      active_runs: number;
      completed_runs: number;
      failed_runs: number;
      cancelled_runs: number;
      timed_out_runs: number;
      simulated_runs: number;
      local_cli_runs: number;
      completed_simulated_runs: number;
      completed_local_runs: number;
    };

    const completedRuns = Number(runStats?.completed_runs ?? 0);
    const failedRuns = Number(runStats?.failed_runs ?? 0);
    const timedOutRuns = Number(runStats?.timed_out_runs ?? 0);

    const successRate = calculateSuccessRate({
      completed: completedRuns,
      failed: failedRuns,
      timedOut: timedOutRuns,
    });

    return {
      totalProjects: Number(projectStats?.total_projects ?? 0),
      activeProjects: Number(projectStats?.active_projects ?? 0),
      archivedProjects: Number(projectStats?.archived_projects ?? 0),
      demoProjectsCount: Number(projectStats?.demo_projects ?? 0),
      totalTasks: Number(taskStats?.total_tasks ?? 0),
      openTasks: Number(taskStats?.open_tasks ?? 0),
      inProgressTasks: Number(taskStats?.in_progress_tasks ?? 0),
      completedTasks: Number(taskStats?.completed_tasks ?? 0),
      totalRuns: Number(runStats?.total_runs ?? 0),
      activeRuns: Number(runStats?.active_runs ?? 0),
      completedRuns,
      failedRuns,
      cancelledRuns: Number(runStats?.cancelled_runs ?? 0),
      timedOutRuns,
      simulatedRuns: Number(runStats?.simulated_runs ?? 0),
      localCliRuns: Number(runStats?.local_cli_runs ?? 0),
      completedSimulatedRuns: Number(runStats?.completed_simulated_runs ?? 0),
      completedLocalRuns: Number(runStats?.completed_local_runs ?? 0),
      successRate,
      successRateDefinition:
        "Calculated as completed runs divided by (completed + failed + timed_out runs). Queued, running, and cancelled runs are excluded from the denominator.",
    };
  }
}

export const runRepository = new RunRepository();
