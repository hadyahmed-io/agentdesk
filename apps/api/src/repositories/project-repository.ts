import crypto from "node:crypto";
import type { z } from "zod";
import { getSqlite, withTransaction } from "../database/client.js";
import { resolveProjectWorkspaceDirectory } from "../utils/security.js";
import type {
  AgentRunStatus,
  createProjectSchema,
  projectQuerySchema,
  updateProjectSchema,
} from "../validators/schemas.js";
import { activityRepository } from "./activity-repository.js";
import { settingsRepository } from "./settings-repository.js";

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  localPath: string | null;
  gitRepoUrl: string | null;
  defaultBranch: string | null;
  language: string | null;
  framework: string | null;
  tags: string[];
  archived: boolean;
  defaultProviderId: string | null;
  agentInstructions: string | null;
  createdAt: string;
  updatedAt: string;
  openTaskCount: number;
  totalTaskCount: number;
  recentRunCount: number;
  latestRunStatus: AgentRunStatus | null;
  latestRunId: string | null;
  latestRunMode: "demo" | "local" | null;
}

interface RawProjectRow {
  id: string;
  name: string;
  description: string;
  local_path: string | null;
  git_repo_url: string | null;
  default_branch: string | null;
  language: string | null;
  framework: string | null;
  tags_json: string;
  archived: number;
  default_provider_id: string | null;
  agent_instructions: string | null;
  created_at: string;
  updated_at: string;
  open_task_count?: number;
  total_task_count?: number;
  recent_run_count?: number;
  latest_run_status?: AgentRunStatus | null;
  latest_run_id?: string | null;
  latest_run_mode?: "demo" | "local" | null;
}

function mapProjectRow(row: RawProjectRow): ProjectRecord {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags_json || "[]");
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    localPath: row.local_path,
    gitRepoUrl: row.git_repo_url,
    defaultBranch: row.default_branch,
    language: row.language,
    framework: row.framework,
    tags,
    archived: Boolean(row.archived),
    defaultProviderId: row.default_provider_id,
    agentInstructions: row.agent_instructions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    openTaskCount: Number(row.open_task_count ?? 0),
    totalTaskCount: Number(row.total_task_count ?? 0),
    recentRunCount: Number(row.recent_run_count ?? 0),
    latestRunStatus: row.latest_run_status ?? null,
    latestRunId: row.latest_run_id ?? null,
    latestRunMode: row.latest_run_mode ?? null,
  };
}

const PROJECT_SELECT_ENRICHED = `
  SELECT
    p.*,
    (
      SELECT COUNT(*) FROM tasks t
      WHERE t.project_id = p.id AND t.status IN ('backlog', 'todo', 'in_progress', 'in_review')
    ) AS open_task_count,
    (
      SELECT COUNT(*) FROM tasks t
      WHERE t.project_id = p.id
    ) AS total_task_count,
    (
      SELECT COUNT(*) FROM agent_runs r
      WHERE r.project_id = p.id
    ) AS recent_run_count,
    (
      SELECT r.status FROM agent_runs r
      WHERE r.project_id = p.id
      ORDER BY r.created_at DESC, r.rowid DESC
      LIMIT 1
    ) AS latest_run_status,
    (
      SELECT r.id FROM agent_runs r
      WHERE r.project_id = p.id
      ORDER BY r.created_at DESC, r.rowid DESC
      LIMIT 1
    ) AS latest_run_id,
    (
      SELECT r.execution_mode FROM agent_runs r
      WHERE r.project_id = p.id
      ORDER BY r.created_at DESC, r.rowid DESC
      LIMIT 1
    ) AS latest_run_mode
  FROM projects p
`;

export class ProjectRepository {
  list(query: z.infer<typeof projectQuerySchema>): {
    items: ProjectRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const sqlite = getSqlite();
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (query.archived === "true") {
      conditions.push("p.archived = 1");
    } else if (query.archived === "false") {
      conditions.push("p.archived = 0");
    }

    if (query.search && query.search.trim().length > 0) {
      const pattern = `%${query.search.trim().toLowerCase()}%`;
      conditions.push(
        "(LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(COALESCE(p.language, '')) LIKE ? OR LOWER(COALESCE(p.framework, '')) LIKE ?)"
      );
      params.push(pattern, pattern, pattern, pattern);
    }

    if (query.tag && query.tag.trim().length > 0) {
      const tagPattern = `%"${query.tag.trim().toLowerCase()}"%`;
      conditions.push("LOWER(p.tags_json) LIKE ?");
      params.push(tagPattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortColumnMap: Record<string, string> = {
      name: "LOWER(p.name)",
      createdAt: "p.created_at",
      updatedAt: "p.updated_at",
    };
    const sortCol = sortColumnMap[query.sortBy] ?? "p.updated_at";
    const sortDir = query.sortOrder === "asc" ? "ASC" : "DESC";

    const countRow = sqlite
      .prepare(`SELECT COUNT(*) AS count FROM projects p ${whereClause}`)
      .get(...params) as unknown as { count: number };
    const total = Number(countRow?.count ?? 0);

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const rows = sqlite
      .prepare(
        `${PROJECT_SELECT_ENRICHED} ${whereClause} ORDER BY ${sortCol} ${sortDir}, p.id ASC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as unknown as RawProjectRow[];

    return {
      items: rows.map(mapProjectRow),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  findById(id: string): ProjectRecord | null {
    const sqlite = getSqlite();
    const row = sqlite
      .prepare(`${PROJECT_SELECT_ENRICHED} WHERE p.id = ?`)
      .get(id) as unknown as RawProjectRow | undefined;
    return row ? mapProjectRow(row) : null;
  }

  create(
    input: z.infer<typeof createProjectSchema>,
    customId?: string
  ): ProjectRecord {
    const id = customId ?? `proj_${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const isDemoProject =
      Boolean(customId?.startsWith("proj_demo_")) || input.name.includes("[Demo]");
    const shouldCreateDirImmediately =
      process.env.DATABASE_URL !== ":memory:" && !process.env.VITEST;
    const resolvedLocalPath =
      input.localPath?.trim() ||
      (isDemoProject
        ? null
        : resolveProjectWorkspaceDirectory(
            input.name,
            id,
            settingsRepository.getAll().approvedWorkspaceRoot,
            shouldCreateDirImmediately
          ));

    withTransaction((sqlite) => {
      sqlite
        .prepare(
          `INSERT INTO projects (
            id, name, description, local_path, git_repo_url, default_branch,
            language, framework, tags_json, archived, default_provider_id,
            agent_instructions, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.name,
          input.description ?? "",
          resolvedLocalPath,
          input.gitRepoUrl ?? null,
          input.defaultBranch ?? null,
          input.language ?? null,
          input.framework ?? null,
          JSON.stringify(input.tags ?? []),
          input.archived ? 1 : 0,
          input.defaultProviderId ?? null,
          input.agentInstructions ?? null,
          now,
          now
        );

      activityRepository.record({
        eventType: "project.created",
        entityType: "project",
        entityId: id,
        projectId: id,
        projectNameSnapshot: input.name,
        title: `Project '${input.name}' created`,
        description: input.description || "Created new project workspace.",
      });
    });

    return this.findById(id)!;
  }

  update(
    id: string,
    patch: z.infer<typeof updateProjectSchema>
  ): ProjectRecord | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const nextName = patch.name !== undefined ? patch.name : existing.name;
    const nextDesc = patch.description !== undefined ? patch.description : existing.description;
    const nextLocalPath = patch.localPath !== undefined ? patch.localPath : existing.localPath;
    const nextGitUrl = patch.gitRepoUrl !== undefined ? patch.gitRepoUrl : existing.gitRepoUrl;
    const nextBranch =
      patch.defaultBranch !== undefined ? patch.defaultBranch : existing.defaultBranch;
    const nextLang = patch.language !== undefined ? patch.language : existing.language;
    const nextFramework = patch.framework !== undefined ? patch.framework : existing.framework;
    const nextTags = patch.tags !== undefined ? patch.tags : existing.tags;
    const nextArchived = patch.archived !== undefined ? patch.archived : existing.archived;
    const nextProvider =
      patch.defaultProviderId !== undefined
        ? patch.defaultProviderId
        : existing.defaultProviderId;
    const nextInstructions =
      patch.agentInstructions !== undefined
        ? patch.agentInstructions
        : existing.agentInstructions;

    withTransaction((sqlite) => {
      sqlite
        .prepare(
          `UPDATE projects SET
            name = ?, description = ?, local_path = ?, git_repo_url = ?,
            default_branch = ?, language = ?, framework = ?, tags_json = ?,
            archived = ?, default_provider_id = ?, agent_instructions = ?, updated_at = ?
          WHERE id = ?`
        )
        .run(
          nextName,
          nextDesc,
          nextLocalPath,
          nextGitUrl,
          nextBranch,
          nextLang,
          nextFramework,
          JSON.stringify(nextTags),
          nextArchived ? 1 : 0,
          nextProvider,
          nextInstructions,
          now,
          id
        );

      const archiveChanged = patch.archived !== undefined && patch.archived !== existing.archived;
      activityRepository.record({
        eventType: archiveChanged
          ? nextArchived
            ? "project.archived"
            : "project.unarchived"
          : "project.updated",
        entityType: "project",
        entityId: id,
        projectId: id,
        projectNameSnapshot: nextName,
        title: archiveChanged
          ? `Project '${nextName}' ${nextArchived ? "archived" : "restored"}`
          : `Project '${nextName}' updated`,
        description: archiveChanged
          ? `Archived status changed to ${nextArchived ? "archived" : "active"}.`
          : "Updated project metadata and configuration.",
      });
    });

    return this.findById(id);
  }

  touchUpdatedAt(id: string): void {
    const sqlite = getSqlite();
    sqlite
      .prepare("UPDATE projects SET updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  delete(id: string): { deleted: boolean; tasksRemoved: number; runsRemoved: number } {
    const existing = this.findById(id);
    if (!existing) {
      return { deleted: false, tasksRemoved: 0, runsRemoved: 0 };
    }

    return withTransaction((sqlite) => {
      const taskCountRow = sqlite
        .prepare("SELECT COUNT(*) AS count FROM tasks WHERE project_id = ?")
        .get(id) as unknown as { count: number };
      const runCountRow = sqlite
        .prepare("SELECT COUNT(*) AS count FROM agent_runs WHERE project_id = ?")
        .get(id) as unknown as { count: number };

      const tasksRemoved = Number(taskCountRow?.count ?? 0);
      const runsRemoved = Number(runCountRow?.count ?? 0);

      sqlite.prepare("DELETE FROM projects WHERE id = ?").run(id);

      activityRepository.record({
        eventType: "project.deleted",
        entityType: "project",
        entityId: id,
        projectId: null,
        projectNameSnapshot: existing.name,
        title: `Project '${existing.name}' permanently deleted`,
        description: `Removed project along with ${tasksRemoved} task(s) and ${runsRemoved} agent run(s).`,
      });

      return { deleted: true, tasksRemoved, runsRemoved };
    });
  }
}

export const projectRepository = new ProjectRepository();
