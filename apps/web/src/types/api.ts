export type TaskStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "cancelled";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type AgentRunStatus =
  | "queued"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type ExecutionMode = "demo" | "local";

export type ProviderKind = "demo" | "local_cli";

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Project {
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
  latestRunMode?: ExecutionMode | null;
}

export interface Task {
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
  latestRunMode?: ExecutionMode | null;
}

export interface AgentProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  isSimulated: boolean;
  description: string;
  enabled: boolean;
  isVerified: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
  requiresAuth?: boolean;
  supportsStreaming?: boolean;
  supportsCancellation?: boolean;
  installed?: boolean | null;
  authenticated?: boolean | null;
  setupInstructions?: string[];
  lastVerificationMessage?: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskTitle: string;
  providerId: string;
  providerName: string;
  providerKind: ProviderKind;
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

export interface RunLog {
  id: string;
  runId: string;
  sequence: number;
  timestamp: string;
  level: LogLevel;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityEvent {
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

export interface WorkspaceMetrics {
  totalProjects: number;
  activeProjects: number;
  archivedProjects: number;
  demoProjectsCount?: number;
  totalTasks: number;
  openTasks: number;
  inProgressTasks: number;
  completedTasks: number;
  totalRuns: number;
  activeRuns: number;
  completedRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  timedOutRuns: number;
  simulatedRuns?: number;
  localCliRuns?: number;
  completedSimulatedRuns?: number;
  completedLocalRuns?: number;
  successRate: number | null;
  successRateDefinition: string;
}

export interface AppSettings {
  theme: "dark" | "light";
  dateFormat: "relative" | "iso" | "locale";
  defaultProjectSort: "updated_desc" | "created_desc" | "name_asc";
  defaultProviderId: string;
  defaultExecutionMode: ExecutionMode;
  logAutoScroll: boolean;
  defaultLogLevelFilter: "all" | "debug" | "info" | "warn" | "error";
  confirmDestructiveActions: boolean;
  approvedWorkspaceRoot: string;
  executionTimeoutMs: number;
}

export interface WorkspaceValidationResult {
  valid: boolean;
  resolvedPath?: string;
  exists?: boolean;
  isDirectory?: boolean;
  withinApprovedRoot?: boolean;
  reason?: string;
}
