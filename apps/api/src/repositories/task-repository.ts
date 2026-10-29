import crypto from "node:crypto";
import type { z } from "zod";
import { getSqlite, withTransaction } from "../database/client.js";
import type {
  AgentRunStatus,
  createTaskSchema,
  TaskPriority,
   taskQuerySchema,
  TaskStatus,
  updateTaskSchema,
} from "../validators/schemas.js";
import { activityRepository } from "./activity-repository.js";
import { projectRepository } from "./project-repository.js";

export interface TaskRecord {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  agentInstructions: string | null;
  acceptanceCriteria: string[];
  dueDate: string | null;
  preferredProviderId: string | null;
  estimatedComplexity: "trivial" | "small" | "medium" | "large" | "epic" | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  runCount: number;
  latestRunStatus: AgentRunStatus | null;
  latestRunId: string | null;
  latestRunMode: "demo" | "local" | null;
}

interface RawTaskRow {
  id: string;
  project_id: string;
  project_name?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels_json: string;
  agent_instructions: string | null;
  acceptance_criteria_json: string;
  due_date: string | null;
  preferred_provider_id: string | null;
  estimated_complexity: "trivial" | "small" | "medium" | "large" | "epic" | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  run_count?: number;
  latest_run_status?: AgentRunStatus | null;
  latest_run_id?: string | null;
  latest_run_mode?: "demo" | "local" | null;
}

function mapTaskRow(row: RawTaskRow): TaskRecord {
  let labels: string[] = [];
  let acceptanceCriteria: string[] = [];
  try {
    labels = JSON.parse(row.labels_json || "[]");
  } catch {
    labels = [];
  }
  try {
    acceptanceCriteria = JSON.parse(row.acceptance_criteria_json || "[]");
  } catch {
    acceptanceCriteria = [];
  }
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name ?? "Unknown Project",
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    labels,
    agentInstructions: row.agent_instructions,
    acceptanceCriteria,
    dueDate: row.due_date,
    preferredProviderId: row.preferred_provider_id,
    estimatedComplexity: row.estimated_complexity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    runCount: Number(row.run_count ?? 0),
    latestRunStatus: row.latest_run_status ?? null,
    latestRunId: row.latest_run_id ?? null,
    latestRunMode: row.latest_run_mode ?? null,
  };
}

const TASK_SELECT_ENRICHED = `
  SELECT
    t.*,
    p.name AS project_name,
    (
      SELECT COUNT(*) FROM agent_runs r WHERE r.task_id = t.id
    ) AS run_count,
    (
      SELECT r.status FROM agent_runs r
      WHERE r.task_id = t.id
      ORDER BY r.created_at DESC, r.rowid DESC
      LIMIT 1
    ) AS latest_run_status,
    (
      SELECT r.id FROM agent_runs r
      WHERE r.task_id = t.id
      ORDER BY r.created_at DESC, r.rowid DESC
      LIMIT 1
    ) AS latest_run_id,
    (
      SELECT r.execution_mode FROM agent_runs r
      WHERE r.task_id = t.id
      ORDER BY r.created_at DESC, r.rowid DESC
      LIMIT 1
    ) AS latest_run_mode
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
`;

export class TaskRepository {
  list(query: z.infer<typeof taskQuerySchema>): {
    items: TaskRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const sqlite = getSqlite();
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query.projectId) {
      conditions.push("t.project_id = ?");
      params.push(query.projectId);
    }

    if (query.status) {
      conditions.push("t.status = ?");
      params.push(query.status);
    }

    if (query.priority) {
      conditions.push("t.priority = ?");
      params.push(query.priority);
    }

    if (query.search && query.search.trim().length > 0) {
      const pattern = `%${query.search.trim().toLowerCase()}%`;
      conditions.push(
        "(LOWER(t.title) LIKE ? OR LOWER(t.description) LIKE ? OR LOWER(p.name) LIKE ? OR LOWER(t.labels_json) LIKE ?)"
      );
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortDir = query.sortOrder === "asc" ? "ASC" : "DESC";
    let orderBySql = `t.updated_at ${sortDir}`;
    if (query.sortBy === "priority") {
      orderBySql = `CASE t.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END ${sortDir}, t.updated_at DESC`;
    } else if (query.sortBy === "dueDate") {
      orderBySql = `CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC, t.due_date ${sortDir}, t.updated_at DESC`;
    } else if (query.sortBy === "createdAt") {
      orderBySql = `t.created_at ${sortDir}`;
    }

    const countRow = sqlite
      .prepare(
        `SELECT COUNT(*) AS count FROM tasks t JOIN projects p ON p.id = t.project_id ${whereClause}`
      )
      .get(...params) as unknown as { count: number };
    const total = Number(countRow?.count ?? 0);

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const rows = sqlite
      .prepare(
        `${TASK_SELECT_ENRICHED} ${whereClause} ORDER BY ${orderBySql}, t.id ASC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as unknown as RawTaskRow[];

    return {
      items: rows.map(mapTaskRow),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  findById(id: string): TaskRecord | null {
    const sqlite = getSqlite();
    const row = sqlite
      .prepare(`${TASK_SELECT_ENRICHED} WHERE t.id = ?`)
      .get(id) as unknown as RawTaskRow | undefined;
    return row ? mapTaskRow(row) : null;
  }

  create(
    input: z.infer<typeof createTaskSchema>,
    customId?: string
  ): TaskRecord {
    const project = projectRepository.findById(input.projectId);
    if (!project) {
      throw new Error(`Project '${input.projectId}' does not exist.`);
    }

    const id = customId ?? `task_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const completedAt = input.status === "done" ? now : null;

    withTransaction((sqlite) => {
      sqlite
        .prepare(
          `INSERT INTO tasks (
            id, project_id, title, description, status, priority,
            labels_json, agent_instructions, acceptance_criteria_json,
            due_date, preferred_provider_id, estimated_complexity,
            created_at, updated_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.projectId,
          input.title,
          input.description ?? "",
          input.status ?? "todo",
          input.priority ?? "medium",
          JSON.stringify(input.labels ?? []),
          input.agentInstructions ?? null,
          JSON.stringify(input.acceptanceCriteria ?? []),
          input.dueDate ?? null,
          input.preferredProviderId ?? null,
          input.estimatedComplexity ?? null,
          now,
          now,
          completedAt
        );

      projectRepository.touchUpdatedAt(input.projectId);

      activityRepository.record({
        eventType: "task.created",
        entityType: "task",
        entityId: id,
        projectId: project.id,
        projectNameSnapshot: project.name,
        title: `Task '${input.title}' created`,
        description: `Created in '${project.name}' with status '${input.status ?? "todo"}' and priority '${input.priority ?? "medium"}'.`,
      });
    });

    return this.findById(id)!;
  }

  update(id: string, patch: z.infer<typeof updateTaskSchema>): TaskRecord | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const nextProjectId = patch.projectId ?? existing.projectId;
    const project = projectRepository.findById(nextProjectId);
    if (!project) {
      throw new Error(`Project '${nextProjectId}' does not exist.`);
    }

    const nextTitle = patch.title ?? existing.title;
    const nextDesc = patch.description ?? existing.description;
    const nextStatus = patch.status ?? existing.status;
    const nextPriority = patch.priority ?? existing.priority;
    const nextLabels = patch.labels ?? existing.labels;
    const nextInstructions =
      patch.agentInstructions !== undefined
        ? patch.agentInstructions
        : existing.agentInstructions;
    const nextCriteria = patch.acceptanceCriteria ?? existing.acceptanceCriteria;
    const nextDueDate = patch.dueDate !== undefined ? patch.dueDate : existing.dueDate;
    const nextProvider =
      patch.preferredProviderId !== undefined
        ? patch.preferredProviderId
        : existing.preferredProviderId;
    const nextComplexity =
      patch.estimatedComplexity !== undefined
        ? patch.estimatedComplexity
        : existing.estimatedComplexity;

    let nextCompletedAt = existing.completedAt;
    if (nextStatus === "done" && existing.status !== "done") {
      nextCompletedAt = now;
    } else if (nextStatus !== "done") {
      nextCompletedAt = null;
    }

    withTransaction((sqlite) => {
      sqlite
        .prepare(
          `UPDATE tasks SET
            project_id = ?, title = ?, description = ?, status = ?, priority = ?,
            labels_json = ?, agent_instructions = ?, acceptance_criteria_json = ?,
            due_date = ?, preferred_provider_id = ?, estimated_complexity = ?,
            updated_at = ?, completed_at = ?
          WHERE id = ?`
        )
        .run(
          nextProjectId,
          nextTitle,
          nextDesc,
          nextStatus,
          nextPriority,
          JSON.stringify(nextLabels),
          nextInstructions,
          JSON.stringify(nextCriteria),
          nextDueDate,
          nextProvider,
          nextComplexity,
          now,
          nextCompletedAt,
          id
        );

      projectRepository.touchUpdatedAt(nextProjectId);

      const statusChanged = patch.status !== undefined && patch.status !== existing.status;
      activityRepository.record({
        eventType: statusChanged ? "task.status_changed" : "task.updated",
        entityType: "task",
        entityId: id,
        projectId: project.id,
        projectNameSnapshot: project.name,
        title: statusChanged
          ? `Task '${nextTitle}' moved to ${nextStatus.replace("_", " ")}`
          : `Task '${nextTitle}' updated`,
        description: statusChanged
          ? `Status changed from '${existing.status}' to '${nextStatus}'.`
          : `Updated task details in '${project.name}'.`,
      });
    });

    return this.findById(id);
  }

  delete(id: string): boolean {
    const existing = this.findById(id);
    if (!existing) return false;

    return withTransaction((sqlite) => {
      sqlite.prepare("DELETE FROM tasks WHERE id = ?").run(id);
      projectRepository.touchUpdatedAt(existing.projectId);

      activityRepository.record({
        eventType: "task.deleted",
        entityType: "task",
        entityId: id,
        projectId: existing.projectId,
        projectNameSnapshot: existing.projectName,
        title: `Task '${existing.title}' deleted`,
        description: `Removed task from '${existing.projectName}'.`,
      });
      return true;
    });
  }
}

export const taskRepository = new TaskRepository();
