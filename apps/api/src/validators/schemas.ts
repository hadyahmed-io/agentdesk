import { z } from "zod";

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const AGENT_RUN_STATUSES = [
  "queued",
  "starting",
  "running",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const TERMINAL_RUN_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
  "timed_out",
]);

export const ACTIVE_RUN_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  "queued",
  "starting",
  "running",
]);

const ALLOWED_RUN_TRANSITIONS: Record<AgentRunStatus, ReadonlySet<AgentRunStatus>> = {
  queued: new Set(["starting", "cancelled", "failed", "timed_out"]),
  starting: new Set(["running", "cancelled", "failed", "timed_out"]),
  running: new Set(["completed", "failed", "cancelled", "timed_out"]),
  completed: new Set([]),
  failed: new Set([]),
  cancelled: new Set([]),
  timed_out: new Set([]),
};

export function canTransitionRunStatus(from: AgentRunStatus, to: AgentRunStatus): boolean {
  if (from === to) return true;
  return ALLOWED_RUN_TRANSITIONS[from]?.has(to) ?? false;
}

export function assertValidRunStatusTransition(from: AgentRunStatus, to: AgentRunStatus): void {
  if (!canTransitionRunStatus(from, to)) {
    throw new Error(`Invalid agent run status transition from '${from}' to '${to}'.`);
  }
}

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const EXECUTION_MODES = ["demo", "local"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const PROVIDER_KINDS = ["demo", "local_cli"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

const gitRepoUrlValidator = z
  .string()
  .trim()
  .max(500, "Repository URL must be 500 characters or fewer.")
  .refine(
    (val) => {
      if (!val) return true;
      if (val.startsWith("git@") || val.startsWith("ssh://")) return true;
      try {
        const parsed = new URL(val);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Must be a valid HTTP(S) or SSH Git repository URL." }
  );

export const createProjectSchema = z.object({
  name: z
    .string({ required_error: "Project name is required." })
    .trim()
    .min(1, "Project name cannot be empty.")
    .max(120, "Project name must be 120 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(2000, "Description must be 2000 characters or fewer.")
    .optional()
    .default(""),
  localPath: z
    .string()
    .trim()
    .max(500, "Local directory path must be 500 characters or fewer.")
    .refine((v) => !v.includes("\0"), "Local path contains invalid characters.")
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  gitRepoUrl: gitRepoUrlValidator
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  defaultBranch: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  language: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  framework: z
    .string()
    .trim()
    .max(60)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(20, "Maximum 20 tags allowed.")
    .optional()
    .default([]),
  archived: z.boolean().optional().default(false),
  defaultProviderId: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  agentInstructions: z
    .string()
    .trim()
    .max(5000, "Agent instructions must be 5000 characters or fewer.")
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const updateProjectSchema = createProjectSchema.partial().refine(
  (data) => data.name === undefined || data.name.trim().length > 0,
  { message: "Project name cannot be empty.", path: ["name"] }
);

export const projectQuerySchema = z.object({
  search: z.string().trim().optional(),
  archived: z
    .enum(["true", "false", "all"])
    .optional()
    .default("false"),
  tag: z.string().trim().optional(),
  sortBy: z.enum(["name", "createdAt", "updatedAt"]).optional().default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const createTaskSchema = z.object({
  projectId: z
    .string({ required_error: "Project ID is required." })
    .trim()
    .min(1, "Project ID is required."),
  title: z
    .string({ required_error: "Title is required." })
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be 5000 characters or fewer.")
    .optional()
    .default(""),
  status: z.enum(TASK_STATUSES).optional().default("todo"),
  priority: z.enum(TASK_PRIORITIES).optional().default("medium"),
  labels: z
    .array(z.string().trim().min(1).max(40))
    .max(15, "Maximum 15 labels allowed.")
    .optional()
    .default([]),
  agentInstructions: z
    .string()
    .trim()
    .max(5000)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  acceptanceCriteria: z
    .array(z.string().trim().min(1, "Criterion cannot be empty.").max(500))
    .max(30, "Maximum 30 acceptance criteria allowed.")
    .optional()
    .default([]),
  dueDate: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  preferredProviderId: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  estimatedComplexity: z
    .enum(["trivial", "small", "medium", "large", "epic"])
    .nullable()
    .optional()
    .default(null),
});

export const updateTaskSchema = createTaskSchema.partial().refine(
  (data) => data.title === undefined || data.title.trim().length > 0,
  { message: "Title cannot be empty.", path: ["title"] }
);

export const taskQuerySchema = z.object({
  search: z.string().trim().optional(),
  projectId: z.string().trim().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  sortBy: z.enum(["updatedAt", "priority", "dueDate", "createdAt"]).optional().default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export const createProviderSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Provider ID must contain only lowercase letters, numbers, and hyphens."),
  name: z.string().trim().min(1).max(100),
  kind: z.enum(PROVIDER_KINDS),
  description: z.string().trim().max(500).optional().default(""),
  enabled: z.boolean().optional().default(true),
  config: z.record(z.unknown()).optional().default({}),
});

export const updateProviderSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export const createRunSchema = z.object({
  taskId: z.string({ required_error: "Task ID is required." }).trim().min(1, "Task ID is required."),
  projectId: z.string().trim().min(1).optional(),
  providerId: z
    .string({ required_error: "Provider ID is required." })
    .trim()
    .min(1, "Provider ID is required."),
  executionMode: z.enum(EXECUTION_MODES).optional(),
  instructionsOverride: z.string().trim().max(8000).optional(),
  workingDirectoryOverride: z.string().trim().max(500).optional(),
  allowFileEdits: z.boolean().optional().default(false),
  simulatedOutcome: z.enum(["completed", "failed", "timed_out"]).optional(),
  stepDelayMs: z.number().int().min(30).max(5000).optional(),
});

export const retryRunSchema = z.object({
  providerId: z.string().trim().min(1).optional(),
  executionMode: z.enum(EXECUTION_MODES).optional(),
  instructionsOverride: z.string().trim().max(8000).optional(),
  simulatedOutcome: z.enum(["completed", "failed", "timed_out"]).optional(),
  stepDelayMs: z.number().int().min(30).max(5000).optional(),
});

export const runQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(AGENT_RUN_STATUSES).optional(),
  projectId: z.string().trim().optional(),
  taskId: z.string().trim().optional(),
  providerId: z.string().trim().optional(),
  executionMode: z.enum(EXECUTION_MODES).optional(),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export const runLogsQuerySchema = z.object({
  level: z.enum(LOG_LEVELS).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

export const updateSettingsSchema = z.object({
  theme: z.enum(["dark", "light"]).optional(),
  dateFormat: z.enum(["relative", "iso", "locale"]).optional(),
  defaultProjectSort: z.enum(["updated_desc", "created_desc", "name_asc"]).optional(),
  defaultProviderId: z.string().trim().min(1).max(80).optional(),
  defaultExecutionMode: z.enum(EXECUTION_MODES).optional(),
  logAutoScroll: z.boolean().optional(),
  defaultLogLevelFilter: z.enum(["all", "debug", "info", "warn", "error"]).optional(),
  confirmDestructiveActions: z.boolean().optional(),
  approvedWorkspaceRoot: z.string().trim().min(1).max(500).optional(),
  executionTimeoutMs: z.number().int().min(1000).max(600000).optional(),
});
