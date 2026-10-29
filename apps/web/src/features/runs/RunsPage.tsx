import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
  TerminalSquare,
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

export function RunsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data: projectsRes } = useQuery({
    queryKey: ["projects", { archived: "all" }],
    queryFn: () => apiClient.listProjects({ archived: "all", limit: 100 }),
  });

  const { data: providersRes } = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiClient.listProviders(),
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "runs",
      {
        search,
        status: statusFilter,
        projectId: projectFilter,
        providerId: providerFilter,
        executionMode: modeFilter,
        page,
      },
    ],
    queryFn: () =>
      apiClient.listRuns({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        projectId: projectFilter || undefined,
        providerId: providerFilter || undefined,
        executionMode: modeFilter || undefined,
        page,
        limit: 20,
      }),
    refetchInterval: 2000,
  });

  const cancelMutation = useMutation({
    mutationFn: (runId: string) =>
      apiClient.cancelRun(runId, "Cancelled from Agent Runs table."),
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

  const retryMutation = useMutation({
    mutationFn: (runId: string) => apiClient.retryRun(runId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast({
        title: `Created retry run ${res.data.id}`,
        description: `Preserved historical run ${res.data.retryOfRunId}.`,
        variant: "success",
      });
    },
  });

  const runs = data?.data ?? [];
  const pagination = data?.pagination;
  const projects = projectsRes?.data ?? [];
  const providers = providersRes?.data ?? [];

  const hasFilters = Boolean(
    search || statusFilter || projectFilter || providerFilter || modeFilter
  );

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("");
    setProjectFilter("");
    setProviderFilter("");
    setModeFilter("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Agent Execution Runs
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Monitor active executions, inspect historical outcomes, and distinguish simulated demo runs from local CLI processes.
          </p>
        </div>

        <Link
          to="/tasks"
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500 self-start sm:self-auto"
        >
          <span>Select Task to Start Run</span>
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search runs"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by run ID, task title, project name, or summary..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter runs by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200"
            >
              <option value="">All Statuses</option>
              <option value="queued">Queued</option>
              <option value="starting">Starting</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="timed_out">Timed Out</option>
            </select>

            <select
              aria-label="Filter runs by project"
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200"
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter runs by provider"
              value={providerFilter}
              onChange={(e) => {
                setProviderFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200"
            >
              <option value="">All Providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter runs by execution mode"
              value={modeFilter}
              onChange={(e) => {
                setModeFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200"
            >
              <option value="">All Modes</option>
              <option value="demo">Simulated Demo</option>
              <option value="local">Local CLI</option>
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 px-2 py-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-xs text-zinc-400">
          Loading agent runs...
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-500/30 bg-zinc-900 p-8 text-center space-y-3">
          <p className="text-sm text-rose-300">Failed to load agent runs.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200"
          >
            Retry
          </button>
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-12 text-center space-y-3">
          <TerminalSquare className="w-8 h-8 text-zinc-500 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-zinc-200">
              {hasFilters ? "No runs matched your filters" : "No agent runs recorded yet"}
            </h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              {hasFilters
                ? "Try resetting your filters or searching for a different keyword."
                : "Open any task and click 'Start Agent Run' to execute a simulated demo or verified local CLI run."}
            </p>
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-950/50">
                  <th className="py-3 px-4">Run ID</th>
                  <th className="py-3 px-4">Task & Project</th>
                  <th className="py-3 px-4">Provider & Mode</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Started & Duration</th>
                  <th className="py-3 px-4">Summary / Stage</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {runs.map((run) => {
                  const active = isRunActive(run.status);
                  return (
                    <tr
                      key={run.id}
                      className={`hover:bg-zinc-800/40 transition-colors ${
                        active ? "bg-indigo-500/5" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Link
                          to={`/runs/${run.id}`}
                          className="font-mono font-semibold text-indigo-400 hover:underline block"
                        >
                          {run.id}
                        </Link>
                        {run.retryOfRunId && (
                          <span className="text-[10px] text-zinc-500">
                            Retry of {run.retryOfRunId}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <Link
                          to={`/tasks/${run.taskId}`}
                          className="font-semibold text-zinc-100 hover:text-indigo-400 block truncate"
                        >
                          {run.taskTitle}
                        </Link>
                        <Link
                          to={`/projects/${run.projectId}`}
                          className="text-zinc-400 hover:underline truncate block mt-0.5"
                        >
                          {run.projectName}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="block text-zinc-200 font-medium mb-1">
                          {run.providerName}
                        </span>
                        <ExecutionModeBadge isSimulated={run.isSimulated} />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <RunStatusBadge status={run.status} size="xs" />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="block font-mono text-zinc-200">
                          {formatDuration(run.durationMs)}
                        </span>
                        <span className="block text-[11px] text-zinc-500">
                          {formatRelativeTime(run.startedAt || run.createdAt)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-zinc-300 line-clamp-2">
                          {run.summary ||
                            run.errorMessage ||
                            run.latestMessage ||
                            "—"}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {active ? (
                            <button
                              type="button"
                              onClick={() => cancelMutation.mutate(run.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
                            >
                              <Ban className="w-3 h-3" />
                              <span>Cancel</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => retryMutation.mutate(run.id)}
                              disabled={retryMutation.isPending}
                              title="Retry run (creates new run record)"
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Retry</span>
                            </button>
                          )}
                          <Link
                            to={`/runs/${run.id}`}
                            className="rounded-lg bg-indigo-600/20 border border-indigo-500/30 px-2.5 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-600/30"
                          >
                            Logs
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3 text-xs text-zinc-400">
              <span>
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total runs)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
