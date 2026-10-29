import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppRoutes, createTestQueryClient } from "../App";
import { ToastProvider } from "../components/toast";
import { apiClient } from "../services/api-client";
import type { AgentRun, Project, Task } from "../types/api";

function renderApp(initialEntries: string[] = ["/"]) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const sampleProject: Project = {
  id: "proj_alpha",
  name: "Alpha Gateway",
  description: "Edge routing microservice",
  localPath: "C:/workspace/alpha",
  gitRepoUrl: "https://github.com/org/alpha",
  defaultBranch: "main",
  language: "TypeScript",
  framework: "Express",
  tags: ["gateway", "backend"],
  archived: false,
  defaultProviderId: "demo-agent",
  agentInstructions: "Follow strict types",
  createdAt: "2026-10-25T08:00:00.000Z",
  updatedAt: "2026-10-25T08:05:00.000Z",
  openTaskCount: 1,
  totalTaskCount: 1,
  recentRunCount: 1,
  latestRunStatus: "completed",
  latestRunId: "run_alpha_01",
};

const sampleTask: Task = {
  id: "task_alpha_1",
  projectId: "proj_alpha",
  projectName: "Alpha Gateway",
  title: "Implement rate limiting",
  description: "Add token bucket rate limiter middleware",
  status: "todo",
  priority: "urgent",
  labels: ["security"],
  agentInstructions: "Use in-memory store",
  acceptanceCriteria: ["Rejects excess requests with 429"],
  dueDate: "2026-11-01",
  preferredProviderId: "demo-agent",
  estimatedComplexity: "medium",
  createdAt: "2026-10-25T08:01:00.000Z",
  updatedAt: "2026-10-25T08:02:00.000Z",
  completedAt: null,
  runCount: 1,
  latestRunStatus: "completed",
  latestRunId: "run_alpha_01",
};

const sampleRun: AgentRun = {
  id: "run_alpha_01",
  projectId: "proj_alpha",
  projectName: "Alpha Gateway",
  taskId: "task_alpha_1",
  taskTitle: "Implement rate limiting",
  providerId: "demo-agent",
  providerName: "AgentDesk Demo Simulator",
  providerKind: "demo",
  isSimulated: true,
  executionMode: "demo",
  status: "completed",
  instructionsSnapshot: "Use in-memory store",
  currentStage: "Completed",
  latestMessage: "[SIMULATED DEMO] Completed workflow.",
  startedAt: "2026-10-25T08:03:00.000Z",
  endedAt: "2026-10-25T08:03:04.000Z",
  durationMs: 4000,
  summary: "[SIMULATED DEMO] Completed workflow.",
  errorMessage: null,
  exitCode: 0,
  cancelledAt: null,
  cancellationReason: null,
  retryOfRunId: null,
  configSnapshot: {},
  createdAt: "2026-10-25T08:03:00.000Z",
  logCount: 2,
};

describe("AgentDesk Frontend UI & Interaction Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(apiClient, "getHealth").mockResolvedValue({
      status: "ok",
      service: "agentdesk-api",
      timestamp: new Date().toISOString(),
      executionModeSummary: {
        demoAvailable: true,
        verifiedLocalProviders: 0,
        mode: "demo_only",
      },
    });

    vi.spyOn(apiClient, "getSettings").mockResolvedValue({
      data: {
        settings: {
          theme: "dark",
          dateFormat: "relative",
          defaultProjectSort: "updated_desc",
          defaultProviderId: "demo-agent",
          defaultExecutionMode: "demo",
          logAutoScroll: true,
          defaultLogLevelFilter: "all",
          confirmDestructiveActions: true,
          approvedWorkspaceRoot: "C:/workspace",
          executionTimeoutMs: 60000,
        },
        workspaceStatus: { valid: true, resolvedPath: "C:/workspace" },
      },
    });

    vi.spyOn(apiClient, "getMetrics").mockResolvedValue({
      data: {
        totalProjects: 1,
        activeProjects: 1,
        archivedProjects: 0,
        totalTasks: 1,
        openTasks: 1,
        inProgressTasks: 0,
        completedTasks: 0,
        totalRuns: 1,
        activeRuns: 0,
        completedRuns: 1,
        failedRuns: 0,
        cancelledRuns: 0,
        timedOutRuns: 0,
        successRate: 100,
        successRateDefinition: "Completed vs terminal runs",
      },
    });

    vi.spyOn(apiClient, "listProviders").mockResolvedValue({
      data: [
        {
          id: "demo-agent",
          name: "AgentDesk Demo Simulator",
          kind: "demo",
          isSimulated: true,
          description: "Simulated demo provider",
          enabled: true,
          isVerified: true,
          lastVerifiedAt: "2026-10-25T08:00:00.000Z",
          lastError: null,
          config: {},
          createdAt: "2026-10-25T08:00:00.000Z",
          updatedAt: "2026-10-25T08:00:00.000Z",
        },
      ],
    });
  });

  it("1. Displays validation errors when submitting an empty project form and creates a project when valid", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "listProjects").mockResolvedValue({
      data: [sampleProject],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });
    const createSpy = vi
      .spyOn(apiClient, "createProject")
      .mockResolvedValue({ data: sampleProject });
    vi.spyOn(apiClient, "getProject").mockResolvedValue({ data: sampleProject });
    vi.spyOn(apiClient, "listTasks").mockResolvedValue({
      data: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 1 },
    });
    vi.spyOn(apiClient, "listRuns").mockResolvedValue({
      data: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 1 },
    });
    vi.spyOn(apiClient, "listActivity").mockResolvedValue({ data: [] });
    vi.spyOn(apiClient, "validateWorkspace").mockResolvedValue({
      data: { valid: true, resolvedPath: "C:/workspace/alpha" },
    });

    renderApp(["/projects"]);

    const newProjBtn = await screen.findByRole("button", { name: /New Project/i });
    await user.click(newProjBtn);

    // Submit empty form to trigger validation error
    const submitBtn = screen.getByRole("button", { name: /Create Project/i });
    await user.click(submitBtn);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Project name is required/i
    );

    // Fill valid project name and submit
    const nameInput = screen.getByLabelText(/Project Name/i);
    await user.type(nameInput, "Alpha Gateway");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
  });

  it("2. Searches and filters tasks, and confirms destructive deletion", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "listProjects").mockResolvedValue({
      data: [sampleProject],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });
    const listTasksSpy = vi.spyOn(apiClient, "listTasks").mockResolvedValue({
      data: [sampleTask],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });
    const deleteTaskSpy = vi
      .spyOn(apiClient, "deleteTask")
      .mockResolvedValue({ data: { deleted: true } });

    renderApp(["/tasks"]);

    expect(await screen.findByText("Implement rate limiting")).toBeInTheDocument();

    // Filter by priority
    const prioritySelect = screen.getByLabelText(/Filter tasks by priority/i);
    await user.selectOptions(prioritySelect, "urgent");

    await waitFor(() => {
      expect(listTasksSpy).toHaveBeenCalledWith(
        expect.objectContaining({ priority: "urgent" })
      );
    });

    // Click Delete task button and confirm in dialog
    const delBtn = screen.getByLabelText(/Delete Implement rate limiting/i);
    await user.click(delBtn);

    expect(
      await screen.findByText(/Delete Task "Implement rate limiting"\?/i)
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /^Delete Task$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(deleteTaskSpy).toHaveBeenCalledWith("task_alpha_1");
    });
  });

  it("3. Navigates from Task Detail to linked Agent Run and renders run status, logs, and failure diagnostics", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getTask").mockResolvedValue({ data: sampleTask });
    vi.spyOn(apiClient, "listRuns").mockResolvedValue({
      data: [sampleRun],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });
    vi.spyOn(apiClient, "listActivity").mockResolvedValue({ data: [] });
    vi.spyOn(apiClient, "getRun").mockResolvedValue({
      data: {
        ...sampleRun,
        status: "failed",
        errorMessage: "Simulated assertion error in step 4",
        exitCode: 1,
      },
    });
    vi.spyOn(apiClient, "getRunLogs").mockResolvedValue({
      data: [
        {
          id: "log_1",
          runId: "run_alpha_01",
          sequence: 1,
          timestamp: "2026-10-25T08:03:01.000Z",
          level: "error",
          eventType: "simulated.error",
          message: "[SIMULATED DEMO] Simulated assertion error in step 4",
        },
      ],
      pagination: { total: 1, page: 1, limit: 200, totalPages: 1 },
    });

    renderApp(["/tasks/task_alpha_1"]);

    expect(await screen.findByText("Implement rate limiting")).toBeInTheDocument();
    expect(
      screen.getByText("Rejects excess requests with 429")
    ).toBeInTheDocument();

    // Navigate from Task to Run
    const runLink = screen.getByRole("link", { name: "run_alpha_01" });
    await user.click(runLink);

    // Verify Run Detail page renders failure diagnostics and persisted logs
    expect(
      await screen.findByText(/Execution Failure Diagnostics/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText("Simulated assertion error in step 4")
    ).toBeInTheDocument();
    expect(
      screen.getByText("[SIMULATED DEMO] Simulated assertion error in step 4")
    ).toBeInTheDocument();
  });

  it("4. Renders Google Antigravity CLI provider details on Providers page and gates selection in RunLauncherModal until verified", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "listProviders").mockResolvedValue({
      data: [
        {
          id: "demo-agent",
          name: "AgentDesk Demo Simulator",
          kind: "demo",
          isSimulated: true,
          description: "Simulated demo provider",
          enabled: true,
          isVerified: true,
          lastVerifiedAt: "2026-10-25T08:00:00.000Z",
          lastError: null,
          requiresAuth: false,
          supportsStreaming: true,
          supportsCancellation: true,
          installed: true,
          authenticated: true,
          setupInstructions: ["Ready offline"],
          config: {},
          createdAt: "2026-10-25T08:00:00.000Z",
          updatedAt: "2026-10-25T08:00:00.000Z",
        },
        {
          id: "google-antigravity-cli",
          name: "Google Antigravity CLI (agy)",
          kind: "local_cli",
          isSimulated: false,
          description: "Official Google Antigravity CLI ('agy') headless adapter.",
          enabled: true,
          isVerified: false,
          lastVerifiedAt: "2026-10-25T09:00:00.000Z",
          lastError:
            "Executable 'agy' was not found on system PATH. Install the official Google Antigravity CLI ('agy') and authenticate.",
          requiresAuth: true,
          supportsStreaming: true,
          supportsCancellation: true,
          installed: false,
          authenticated: false,
          setupInstructions: [
            "Install the official Antigravity CLI ('agy') from https://antigravity.google/docs/getting-started?tab=cli.",
            "Authenticate by running 'agy' interactively once or setting GEMINI_API_KEY.",
          ],
          config: { executable: "agy", outputFormat: "stream-json", sandbox: true },
          createdAt: "2026-10-25T08:00:00.000Z",
          updatedAt: "2026-10-25T09:00:00.000Z",
        },
      ],
    });
    vi.spyOn(apiClient, "getTask").mockResolvedValue({ data: sampleTask });
    vi.spyOn(apiClient, "listRuns").mockResolvedValue({
      data: [],
      pagination: { total: 0, page: 1, limit: 50, totalPages: 1 },
    });
    vi.spyOn(apiClient, "listActivity").mockResolvedValue({ data: [] });

    renderApp(["/providers"]);

    expect(
      await screen.findByText("Google Antigravity CLI (agy)")
    ).toBeInTheDocument();
    expect(screen.getByText("Not Installed")).toBeInTheDocument();
    expect(screen.getByText("Required (Not Configured)")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Executable 'agy' was not found on system PATH/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Install the official Antigravity CLI/i)
    ).toBeInTheDocument();

    // Navigate to Task detail and open Run Launcher Modal; confirm unverified Antigravity option is disabled
    const tasksLink = screen.getByRole("link", { name: /^Tasks$/i });
    vi.spyOn(apiClient, "listProjects").mockResolvedValue({
      data: [sampleProject],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });
    vi.spyOn(apiClient, "listTasks").mockResolvedValue({
      data: [sampleTask],
      pagination: { total: 1, page: 1, limit: 50, totalPages: 1 },
    });
    await user.click(tasksLink);

    const runBtn = await screen.findByRole("button", { name: /^Run$/i });
    await user.click(runBtn);

    const selectEl = (await screen.findByLabelText(
      /Select Agent Provider/i
    )) as HTMLSelectElement;
    const agyOption = Array.from(selectEl.options).find(
      (opt) => opt.value === "google-antigravity-cli"
    );
    expect(agyOption).toBeDefined();
    expect(agyOption?.disabled).toBe(true);
  });
});
