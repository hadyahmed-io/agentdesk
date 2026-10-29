import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  FolderGit2,
  FolderKanban,
  ListChecks,
  Loader2,
  Plus,
  Server,
  Sparkles,
  TerminalSquare,
  Trash2,
  XCircle,
} from "lucide-react";
import { apiClient } from "../../services/api-client";
import {
  formatDuration,
  formatRelativeTime,
  isRunActive,
} from "../../lib/utils";
import {
  ExecutionModeBadge,
  RunStatusBadge,
} from "../../components/badges";
import { useToast } from "../../components/toast";
import { ProjectFormModal } from "../projects/ProjectFormModal";
import { TaskFormModal } from "../tasks/TaskFormModal";

export function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [daysFilter, setDaysFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [providerFilter, setProviderFilter] = useState<string>("");

  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  const { data: metricsRes, isLoading: metricsLoading } = useQuery({
    queryKey: [
      "metrics",
      {
        projectId: projectFilter || undefined,
        providerId: providerFilter || undefined,
        days: daysFilter === "all" ? undefined : Number(daysFilter),
      },
    ],
    queryFn: () =>
      apiClient.getMetrics({
        projectId: projectFilter || undefined,
        providerId: providerFilter || undefined,
        days: daysFilter === "all" ? undefined : Number(daysFilter),
      }),
    refetchInterval: 2500,
  });

  const { data: projectsRes } = useQuery({
    queryKey: ["projects", { archived: "false", limit: 6 }],
    queryFn: () =>
      apiClient.listProjects({
        archived: "false",
        sortBy: "updatedAt",
        sortOrder: "desc",
        limit: 6,
      }),
    refetchInterval: 5000,
  });

  const { data: runsRes } = useQuery({
    queryKey: [
      "runs",
      "dashboard",
      { projectId: projectFilter || undefined, providerId: providerFilter || undefined },
    ],
    queryFn: () =>
      apiClient.listRuns({
        projectId: projectFilter || undefined,
        providerId: providerFilter || undefined,
        limit: 12,
      }),
    refetchInterval: 2000,
  });

  const { data: providersRes } = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiClient.listProviders(),
  });

  const { data: activityRes } = useQuery({
    queryKey: ["activity", { projectId: projectFilter || undefined, limit: 12 }],
    queryFn: () =>
      apiClient.listActivity({
        projectId: projectFilter || undefined,
        limit: 12,
      }),
    refetchInterval: 4000,
  });

  const seedMutation = useMutation({
    mutationFn: () => apiClient.seedDemoData(),
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      toast({
        title: res.data.alreadySeeded
          ? "Demonstration data already loaded"
          : "Demonstration workspace loaded",
        description: res.data.alreadySeeded
          ? "All demonstration projects, tasks, and runs are already present."
          : `Created ${res.data.projectsCreated} demo projects, ${res.data.tasksCreated} demo tasks, and ${res.data.runsCreated} simulated demo runs.`,
        variant: "success",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to load demo dataset",
        description: err.message,
        variant: "error",
      });
    },
  });

  const clearDemoMutation = useMutation({
    mutationFn: () => apiClient.clearDemoData(),
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      toast({
        title: "Demonstration data removed",
        description: `Removed ${res.data.projectsRemoved} demo project(s), ${res.data.tasksRemoved} demo task(s), and ${res.data.runsRemoved} simulated run(s).`,
        variant: "info",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to remove demo data",
        description: err.message,
        variant: "error",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (runId: string) =>
      apiClient.cancelRun(runId, "Cancelled from Dashboard active runs panel."),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast({
        title: `Run ${res.data.id} cancelled`,
        variant: "info",
      });
    },
  });

  const metrics = metricsRes?.data;
  const recentProjects = projectsRes?.data ?? [];
  const allRecentRuns = runsRes?.data ?? [];
  const activeRuns = allRecentRuns.filter((r) => isRunActive(r.status));
  const providers = providersRes?.data ?? [];
  const activities = activityRes?.data ?? [];

  const isEmptyWorkspace =
    !metricsLoading &&
    metrics &&
    metrics.totalProjects === 0 &&
    !projectFilter &&
    !providerFilter;

  return (
    <div className="space-y-6">
      {/* Page Heading & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Workspace Overview
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            One workspace to manage your projects, coordinate AI coding tasks, and understand every agent run.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setCreateTaskOpen(true)}
            disabled={(metrics?.totalProjects ?? 0) === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Task</span>
          </button>
          <button
            type="button"
            onClick={() => setCreateProjectOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Onboarding Empty State for a Fresh Installation */}
      {isEmptyWorkspace && (
        <div className="rounded-xl border border-indigo-500/30 bg-zinc-900/90 p-6 shadow-lg space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium text-indigo-300 border border-indigo-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Getting Started with AgentDesk</span>
              </div>
              <h2 className="text-base font-semibold text-zinc-100 pt-1">
                Your local SQLite workspace is initialized and ready
              </h2>
              <p className="text-xs text-zinc-400">
                Follow the four steps below to run your first workflow, or load the optional demonstration dataset to explore immediately.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                <span>
                  {seedMutation.isPending
                    ? "Loading Demo Data..."
                    : "Load Demo Data"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCreateProjectOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>1. Create First Project</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400">Step 1</span>
                <FolderKanban className="w-4 h-4 text-zinc-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">Create a Project</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Register a repository name, optional local workspace directory, and default agent instructions.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400">Step 2</span>
                <ListChecks className="w-4 h-4 text-zinc-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">Add a Task</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Define a concrete development task with priority, labels, and structured acceptance criteria.
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400">Step 3</span>
                <Server className="w-4 h-4 text-zinc-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">Choose a Provider</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Use the offline Demo Simulator or verify the Local Workspace CLI provider on the{" "}
                <Link to="/providers" className="text-indigo-400 hover:underline">
                  Providers page
                </Link>
                .
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400">Step 4</span>
                <TerminalSquare className="w-4 h-4 text-zinc-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">Start & Monitor Run</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Launch an agent run from any task and inspect real-time lifecycle stages, structured logs, and outcomes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Demo Dataset Active Banner */}
      {(metrics?.demoProjectsCount ?? 0) > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <div className="space-y-0.5">
            <p className="font-semibold text-amber-300">
              Demonstration Dataset Loaded ({metrics?.demoProjectsCount} [Demo] project
              {metrics?.demoProjectsCount === 1 ? "" : "s"})
            </p>
            <p className="text-amber-200/80">
              Seeded demo projects and simulated runs are explicitly marked as{" "}
              <strong>[Demo]</strong> and <strong>Simulated Demo</strong>. You can remove all demonstration records at any time without affecting your user-created projects.
            </p>
          </div>
          <button
            type="button"
            onClick={() => clearDemoMutation.mutate()}
            disabled={clearDemoMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-zinc-950/70 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-zinc-900 shrink-0 self-start sm:self-center"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {clearDemoMutation.isPending
                ? "Removing Demo Data..."
                : "Remove Demo Data"}
            </span>
          </button>
        </div>
      )}

      {/* Dashboard Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-4 py-3">
        <span className="text-xs font-medium text-zinc-400">
          Filter Workspace Metrics & Activity:
        </span>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter by time period"
            value={daysFilter}
            onChange={(e) => setDaysFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
          >
            <option value="all">All Time</option>
            <option value="1">Last 24 Hours</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
          </select>

          <select
            aria-label="Filter by project"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
          >
            <option value="">All Projects</option>
            {recentProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by provider"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
          >
            <option value="">All Providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {(daysFilter !== "all" || projectFilter || providerFilter) && (
            <button
              type="button"
              onClick={() => {
                setDaysFilter("all");
                setProjectFilter("");
                setProviderFilter("");
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Summary Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Total Projects</span>
            <FolderKanban className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-100">
            {metrics?.totalProjects ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {metrics?.activeProjects ?? 0} active · {metrics?.archivedProjects ?? 0} archived
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Open Tasks</span>
            <ListChecks className="w-4 h-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-100">
            {metrics?.openTasks ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {metrics?.inProgressTasks ?? 0} in progress · {metrics?.completedTasks ?? 0} done
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Active Runs</span>
            <Loader2
              className={`w-4 h-4 text-indigo-400 ${
                (metrics?.activeRuns ?? 0) > 0 ? "animate-spin" : ""
              }`}
            />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-100">
            {metrics?.activeRuns ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {metrics?.localCliRuns ?? 0} real CLI · {metrics?.simulatedRuns ?? 0} simulated
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Successful Runs</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400">
            {metrics?.completedRuns ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {metrics?.completedLocalRuns ?? 0} real CLI · {metrics?.completedSimulatedRuns ?? 0} simulated
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Failed / Timed Out</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-400">
            {(metrics?.failedRuns ?? 0) + (metrics?.timedOutRuns ?? 0)}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {metrics?.failedRuns ?? 0} failed · {metrics?.cancelledRuns ?? 0} cancelled
          </p>
        </div>

        <div
          className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-4"
          title={metrics?.successRateDefinition}
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-medium">Success Rate</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-100">
            {metrics?.successRate !== null && metrics?.successRate !== undefined
              ? `${metrics.successRate}%`
              : "—"}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Completed vs terminal outcomes
          </p>
        </div>
      </div>

      {/* Active Agent Runs Section */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <TerminalSquare className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-100">
              Active Agent Executions ({activeRuns.length})
            </h2>
          </div>
          <Link
            to="/runs"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            <span>View All Runs</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {activeRuns.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-xs text-zinc-400">
              No agent runs are currently executing. Open any task and click{" "}
              <strong className="text-zinc-200">Launch Run</strong> to start a simulated demo or local CLI execution.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/80">
            {activeRuns.map((run) => (
              <div
                key={run.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 bg-indigo-500/5"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/runs/${run.id}`}
                      className="text-xs font-mono font-semibold text-indigo-400 hover:underline"
                    >
                      {run.id}
                    </Link>
                    <RunStatusBadge status={run.status} size="xs" />
                    <ExecutionModeBadge isSimulated={run.isSimulated} />
                    <span className="text-xs text-zinc-400">
                      {run.projectName} · {run.taskTitle}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 truncate">
                    <span className="font-medium text-indigo-300">
                      {run.currentStage || "Running"}:
                    </span>{" "}
                    {run.latestMessage || "Processing instructions..."}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-mono text-zinc-400">
                    {formatDuration(run.durationMs)}
                  </span>
                  <button
                    type="button"
                    onClick={() => cancelMutation.mutate(run.id)}
                    className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
                  >
                    Cancel
                  </button>
                  <Link
                    to={`/runs/${run.id}`}
                    className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Inspect Live
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Two-Column Grid: Recent Projects & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Projects (7 cols) */}
        <div className="lg:col-span-7 rounded-xl border border-zinc-800/80 bg-zinc-900/70 flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Recent Projects</h2>
            </div>
            <Link
              to="/projects"
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
            >
              <span>All Projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentProjects.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-xs text-zinc-400">No active projects found.</p>
              <button
                type="button"
                onClick={() => setCreateProjectOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Project</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/80">
              {recentProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-zinc-800/40 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/projects/${project.id}`}
                        className="text-sm font-semibold text-zinc-100 hover:text-indigo-400 truncate"
                      >
                        {project.name}
                      </Link>
                      {project.language && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                          {project.language}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-1">
                      {project.description || "No description provided."}
                    </p>
                    {(project.localPath || project.gitRepoUrl) && (
                      <p className="text-[11px] font-mono text-zinc-500 truncate flex items-center gap-1">
                        <FolderGit2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {project.localPath || project.gitRepoUrl}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="block text-xs font-medium text-zinc-200">
                        {project.openTaskCount} open task
                        {project.openTaskCount === 1 ? "" : "s"}
                      </span>
                      <span className="block text-[11px] text-zinc-500">
                        Updated {formatRelativeTime(project.updatedAt)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <RunStatusBadge status={project.latestRunStatus} size="xs" />
                      {project.latestRunStatus && project.latestRunMode && (
                        <ExecutionModeBadge isSimulated={project.latestRunMode === "demo"} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity Feed (5 cols) */}
        <div className="lg:col-span-5 rounded-xl border border-zinc-800/80 bg-zinc-900/70 flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Recent Activity</h2>
            </div>
            <span className="text-[11px] text-zinc-500">Persistent Audit Log</span>
          </div>

          {activities.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No workspace events recorded yet. Actions on projects, tasks, and agent runs will appear here.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/70 max-h-[420px] overflow-y-auto">
              {activities.map((ev) => {
                const isSimulatedEvent =
                  ev.metadata?.isSimulated === true ||
                  ev.metadata?.executionMode === "demo";
                return (
                  <div key={ev.id} className="px-5 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isSimulatedEvent && (
                          <span className="rounded bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 shrink-0">
                            Simulated
                          </span>
                        )}
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {ev.title}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-500 shrink-0">
                        {formatRelativeTime(ev.createdAt)}
                      </span>
                    </div>
                    {ev.description && (
                      <p className="text-xs text-zinc-400 line-clamp-2">
                        {ev.description}
                      </p>
                    )}
                    {ev.projectNameSnapshot && (
                      <p className="text-[11px] text-indigo-400">
                        Project: {ev.projectNameSnapshot}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ProjectFormModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onSuccessProject={(created) => navigate(`/projects/${created.id}`)}
      />

      <TaskFormModal
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
      />
    </div>
  );
}
