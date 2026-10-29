import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    localPath: text("local_path"),
    gitRepoUrl: text("git_repo_url"),
    defaultBranch: text("default_branch"),
    language: text("language"),
    framework: text("framework"),
    tagsJson: text("tags_json").notNull().default("[]"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    defaultProviderId: text("default_provider_id"),
    agentInstructions: text("agent_instructions"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_projects_archived").on(table.archived),
    index("idx_projects_updated_at").on(table.updatedAt),
  ]
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("medium"),
    labelsJson: text("labels_json").notNull().default("[]"),
    agentInstructions: text("agent_instructions"),
    acceptanceCriteriaJson: text("acceptance_criteria_json").notNull().default("[]"),
    dueDate: text("due_date"),
    preferredProviderId: text("preferred_provider_id"),
    estimatedComplexity: text("estimated_complexity"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_tasks_project_id").on(table.projectId),
    index("idx_tasks_status").on(table.status),
    index("idx_tasks_priority").on(table.priority),
    index("idx_tasks_updated_at").on(table.updatedAt),
  ]
);

export const agentProviders = sqliteTable("agent_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  description: text("description").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  isVerified: integer("is_verified", { mode: "boolean" }).notNull().default(false),
  lastVerifiedAt: text("last_verified_at"),
  lastError: text("last_error"),
  configJson: text("config_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => agentProviders.id),
    executionMode: text("execution_mode").notNull(),
    status: text("status").notNull(),
    instructionsSnapshot: text("instructions_snapshot").notNull(),
    currentStage: text("current_stage"),
    latestMessage: text("latest_message"),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    durationMs: integer("duration_ms"),
    summary: text("summary"),
    errorMessage: text("error_message"),
    exitCode: integer("exit_code"),
    cancelledAt: text("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    retryOfRunId: text("retry_of_run_id"),
    configSnapshotJson: text("config_snapshot_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_runs_project_id").on(table.projectId),
    index("idx_runs_task_id").on(table.taskId),
    index("idx_runs_provider_id").on(table.providerId),
    index("idx_runs_status").on(table.status),
    index("idx_runs_created_at").on(table.createdAt),
  ]
);

export const runLogs = sqliteTable(
  "run_logs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    timestamp: text("timestamp").notNull(),
    level: text("level").notNull().default("info"),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    metadataJson: text("metadata_json"),
  },
  (table) => [
    index("idx_run_logs_run_id_seq").on(table.runId, table.sequence),
    index("idx_run_logs_level").on(table.level),
  ]
);

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    projectId: text("project_id"),
    projectNameSnapshot: text("project_name_snapshot"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_activity_project_id").on(table.projectId),
    index("idx_activity_created_at").on(table.createdAt),
  ]
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});
