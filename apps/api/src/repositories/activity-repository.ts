import crypto from "node:crypto";
import { getSqlite } from "../database/client.js";
import { redactMetadata, redactSecrets } from "../utils/security.js";

export interface ActivityEventRecord {
  id: string;
  eventType: string;
  entityType: "project" | "task" | "run" | "provider" | "settings";
  entityId: string;
  projectId: string | null;
  projectNameSnapshot: string | null;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateActivityInput {
  eventType: string;
  entityType: "project" | "task" | "run" | "provider" | "settings";
  entityId: string;
  projectId?: string | null;
  projectNameSnapshot?: string | null;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

interface RawActivityRow {
  id: string;
  event_type: string;
  entity_type: "project" | "task" | "run" | "provider" | "settings";
  entity_id: string;
  project_id: string | null;
  project_name_snapshot: string | null;
  title: string;
  description: string;
  metadata_json: string;
  created_at: string;
}

function mapRow(row: RawActivityRow): ActivityEventRecord {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata_json || "{}");
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    projectId: row.project_id,
    projectNameSnapshot: row.project_name_snapshot,
    title: row.title,
    description: row.description,
    metadata,
    createdAt: row.created_at,
  };
}

export class ActivityRepository {
  record(input: CreateActivityInput): ActivityEventRecord {
    const sqlite = getSqlite();
    const id = `act_${crypto.randomUUID().slice(0, 12)}`;
    const createdAt = input.createdAt ?? new Date().toISOString();
    const safeMetadata = redactMetadata(input.metadata) ?? {};

    sqlite
      .prepare(
        `INSERT INTO activity_events (
          id, event_type, entity_type, entity_id, project_id, project_name_snapshot, title, description, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.eventType,
        input.entityType,
        input.entityId,
        input.projectId ?? null,
        input.projectNameSnapshot ?? null,
        redactSecrets(input.title),
        redactSecrets(input.description ?? ""),
        JSON.stringify(safeMetadata),
        createdAt
      );

    return {
      id,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId ?? null,
      projectNameSnapshot: input.projectNameSnapshot ?? null,
      title: redactSecrets(input.title),
      description: redactSecrets(input.description ?? ""),
      metadata: safeMetadata,
      createdAt,
    };
  }

  list(options: {
    projectId?: string;
    entityId?: string;
    limit?: number;
  } = {}): ActivityEventRecord[] {
    const sqlite = getSqlite();
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (options.projectId) {
      conditions.push("project_id = ?");
      params.push(options.projectId);
    }
    if (options.entityId) {
      conditions.push("entity_id = ?");
      params.push(options.entityId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(Math.max(options.limit ?? 40, 1), 200);
    params.push(limit);

    const rows = sqlite
      .prepare(
        `SELECT * FROM activity_events ${whereClause} ORDER BY created_at DESC, rowid DESC LIMIT ?`
      )
      .all(...params) as unknown as RawActivityRow[];

    return rows.map(mapRow);
  }
}

export const activityRepository = new ActivityRepository();
