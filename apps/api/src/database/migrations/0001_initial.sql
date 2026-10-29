-- Migration 0001: Initial AgentDesk Schema

CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  local_path TEXT,
  git_repo_url TEXT,
  default_branch TEXT,
  language TEXT,
  framework TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0,
  default_provider_id TEXT,
  agent_instructions TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  labels_json TEXT NOT NULL DEFAULT '[]',
  agent_instructions TEXT,
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  due_date TEXT,
  preferred_provider_id TEXT,
  estimated_complexity TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);

CREATE TABLE IF NOT EXISTS agent_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  is_verified INTEGER NOT NULL DEFAULT 0,
  last_verified_at TEXT,
  last_error TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES agent_providers(id),
  execution_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  instructions_snapshot TEXT NOT NULL,
  current_stage TEXT,
  latest_message TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_ms INTEGER,
  summary TEXT,
  error_message TEXT,
  exit_code INTEGER,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  retry_of_run_id TEXT,
  config_snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_project_id ON agent_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_task_id ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_provider_id ON agent_runs(provider_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON agent_runs(created_at);

CREATE TABLE IF NOT EXISTS run_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_run_logs_run_id_seq ON run_logs(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_run_logs_level ON run_logs(level);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  project_id TEXT,
  project_name_snapshot TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_project_id ON activity_events(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_events(created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
