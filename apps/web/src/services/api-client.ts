import type {
  ActivityEvent,
  AgentProvider,
  AgentRun,
  AppSettings,
  PaginationMeta,
  Project,
  RunLog,
  Task,
  WorkspaceMetrics,
  WorkspaceValidationResult,
} from "../types/api";

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    code = "API_ERROR",
    statusCode = 500,
    details?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errPayload: {
      error?: {
        code?: string;
        message?: string;
        details?: Array<{ field: string; message: string }>;
      };
    } = {};
    try {
      errPayload = await response.json();
    } catch {
      // Ignore JSON parse error
    }
    throw new ApiClientError(
      errPayload.error?.message || `Request failed with HTTP ${response.status}`,
      errPayload.error?.code || "HTTP_ERROR",
      response.status,
      errPayload.error?.details
    );
  }

  return response.json() as Promise<T>;
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      searchParams.set(k, String(v));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : "";
}

export const apiClient = {
  getHealth: () =>
    request<{
      status: string;
      service: string;
      timestamp: string;
      executionModeSummary: {
        demoAvailable: boolean;
        verifiedLocalProviders: number;
        mode: "demo_only" | "local_and_demo";
      };
    }>("/api/health"),

  getMetrics: (params?: { projectId?: string; providerId?: string; days?: number }) =>
    request<{ data: WorkspaceMetrics }>(`/api/metrics${buildQuery(params ?? {})}`),

  globalSearch: (q: string) =>
    request<{
      data: {
        projects: Project[];
        tasks: Task[];
        runs: AgentRun[];
      };
    }>(`/api/search${buildQuery({ q })}`),

  seedDemoData: () =>
    request<{
      data: {
        projectsCreated: number;
        tasksCreated: number;
        runsCreated: number;
        alreadySeeded: boolean;
      };
    }>("/api/seed", { method: "POST" }),

  clearDemoData: () =>
    request<{
      data: {
        projectsRemoved: number;
        tasksRemoved: number;
        runsRemoved: number;
        activityRemoved: number;
      };
    }>("/api/seed", { method: "DELETE" }),

  // Projects
  listProjects: (params?: {
    search?: string;
    archived?: "true" | "false" | "all";
    tag?: string;
    sortBy?: "name" | "createdAt" | "updatedAt";
    sortOrder?: "asc" | "desc";
    page?: number;
    limit?: number;
  }) =>
    request<{ data: Project[]; pagination: PaginationMeta }>(
      `/api/projects${buildQuery(params ?? {})}`
    ),

  getProject: (projectId: string) =>
    request<{ data: Project }>(`/api/projects/${encodeURIComponent(projectId)}`),

  createProject: (payload: Partial<Project> & { name: string }) =>
    request<{ data: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateProject: (projectId: string, payload: Partial<Project>) =>
    request<{ data: Project }>(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteProject: (projectId: string) =>
    request<{ data: { deleted: boolean; tasksRemoved: number; runsRemoved: number } }>(
      `/api/projects/${encodeURIComponent(projectId)}`,
      { method: "DELETE" }
    ),

  // Tasks
  listTasks: (params?: {
    search?: string;
    projectId?: string;
    status?: string;
    priority?: string;
    sortBy?: "updatedAt" | "priority" | "dueDate" | "createdAt";
    sortOrder?: "asc" | "desc";
    page?: number;
    limit?: number;
  }) =>
    request<{ data: Task[]; pagination: PaginationMeta }>(
      `/api/tasks${buildQuery(params ?? {})}`
    ),

  getTask: (taskId: string) =>
    request<{ data: Task }>(`/api/tasks/${encodeURIComponent(taskId)}`),

  createTask: (payload: Partial<Task> & { projectId: string; title: string }) =>
    request<{ data: Task }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTask: (taskId: string, payload: Partial<Task>) =>
    request<{ data: Task }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteTask: (taskId: string) =>
    request<{ data: { deleted: boolean } }>(
      `/api/tasks/${encodeURIComponent(taskId)}`,
      { method: "DELETE" }
    ),

  // Providers
  listProviders: () => request<{ data: AgentProvider[] }>("/api/providers"),

  getProvider: (providerId: string) =>
    request<{ data: AgentProvider }>(`/api/providers/${encodeURIComponent(providerId)}`),

  updateProvider: (
    providerId: string,
    payload: {
      name?: string;
      description?: string;
      enabled?: boolean;
      config?: Record<string, unknown>;
    }
  ) =>
    request<{ data: AgentProvider }>(`/api/providers/${encodeURIComponent(providerId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  testProvider: (providerId: string) =>
    request<{
      data: {
        provider: AgentProvider;
        validation: { valid: boolean; message: string; details?: Record<string, unknown> };
      };
    }>(`/api/providers/${encodeURIComponent(providerId)}/test`, {
      method: "POST",
    }),

  // Agent Runs
  listRuns: (params?: {
    search?: string;
    status?: string;
    projectId?: string;
    taskId?: string;
    providerId?: string;
    executionMode?: string;
    fromDate?: string;
    toDate?: string;
    sortOrder?: "asc" | "desc";
    page?: number;
    limit?: number;
  }) =>
    request<{ data: AgentRun[]; pagination: PaginationMeta }>(
      `/api/runs${buildQuery(params ?? {})}`
    ),

  getRun: (runId: string) =>
    request<{ data: AgentRun }>(`/api/runs/${encodeURIComponent(runId)}`),

  createRun: (payload: {
    taskId: string;
    projectId?: string;
    providerId: string;
    executionMode?: "demo" | "local";
    instructionsOverride?: string;
    workingDirectoryOverride?: string;
    allowFileEdits?: boolean;
    simulatedOutcome?: "completed" | "failed" | "timed_out";
    stepDelayMs?: number;
  }) =>
    request<{ data: AgentRun }>("/api/runs", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  cancelRun: (runId: string, reason?: string) =>
    request<{ data: AgentRun }>(`/api/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  retryRun: (
    runId: string,
    payload?: {
      providerId?: string;
      executionMode?: "demo" | "local";
      instructionsOverride?: string;
      simulatedOutcome?: "completed" | "failed" | "timed_out";
      stepDelayMs?: number;
    }
  ) =>
    request<{ data: AgentRun }>(`/api/runs/${encodeURIComponent(runId)}/retry`, {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }),

  getRunLogs: (
    runId: string,
    params?: { level?: string; search?: string; page?: number; limit?: number }
  ) =>
    request<{ data: RunLog[]; pagination: PaginationMeta }>(
      `/api/runs/${encodeURIComponent(runId)}/logs${buildQuery(params ?? {})}`
    ),

  // Settings & Workspace
  getSettings: () =>
    request<{
      data: {
        settings: AppSettings;
        workspaceStatus: WorkspaceValidationResult;
      };
    }>("/api/settings"),

  updateSettings: (payload: Partial<AppSettings>) =>
    request<{
      data: {
        settings: AppSettings;
        workspaceStatus: WorkspaceValidationResult;
      };
    }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  validateWorkspace: (candidatePath: string) =>
    request<{ data: WorkspaceValidationResult }>("/api/settings/validate-workspace", {
      method: "POST",
      body: JSON.stringify({ candidatePath }),
    }),

  exportMetadata: () => request<{ data: Record<string, unknown> }>("/api/settings/export"),

  // Activity
  listActivity: (params?: { projectId?: string; entityId?: string; limit?: number }) =>
    request<{ data: ActivityEvent[] }>(`/api/activity${buildQuery(params ?? {})}`),
};
