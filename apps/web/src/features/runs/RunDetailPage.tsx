import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FolderKanban,
  ListChecks,
  Loader2,
  RotateCcw,
  Search,
  Terminal,
} from "lucide-react";
import { apiClient } from "../../services/api-client";
import type { LogLevel } from "../../types/api";
import {
  formatDateTime,
  formatDuration,
  isRunActive,
} from "../../lib/utils";
import {
  ExecutionModeBadge,
  RunStatusBadge,
} from "../../components/badges";
import { CopyButton, Modal } from "../../components/modals";
import { useToast } from "../../components/toast";

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [logLevelFilter, setLogLevelFilter] = useState<string>("");
  const [logSearch, setLogSearch] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);
  const [retryModalOpen, setRetryModalOpen] = useState<boolean>(false);
  const [retryOutcome, setRetryOutcome] = useState<
    "completed" | "failed" | "timed_out"
  >("completed");

  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const {
    data: runRes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["run", runId],
    queryFn: () => apiClient.getRun(runId!),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.data.status;
      return status && isRunActive(status) ? 900 : false;
    },
  });

  const run = runRes?.data;
  const active = Boolean(run && isRunActive(run.status));

  const { data: logsRes } = useQuery({
    queryKey: ["run-logs", runId, { level: logLevelFilter, search: logSearch }],
    queryFn: () =>
      apiClient.getRunLogs(runId!, {
        level: logLevelFilter || undefined,
        search: logSearch.trim() || undefined,
        limit: 500,
      }),
    enabled: Boolean(runId),
    refetchInterval: active ? 900 : false,
  });

  // Subscribe to Server-Sent Events while run is active
  useEffect(() => {
    if (!runId || !active || typeof EventSource === "undefined") return;

    const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ["run", runId] });
      queryClient.invalidateQueries({ queryKey: ["run-logs", runId] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    };

    es.addEventListener("run_updated", refresh);
    es.addEventListener("log_appended", refresh);

    return () => {
      es.close();
    };
  }, [runId, active, queryClient]);

  const logs = logsRes?.data ?? [];

  useEffect(() => {
    if (autoScroll && active && logsEndRef.current) {
      logsEndRef.current.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [logs.length, autoScroll, active]);

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiClient.cancelRun(runId!, "Cancelled by user on Run Detail screen."),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["run", runId] });
      queryClient.invalidateQueries({ queryKey: ["run-logs", runId] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      toast({
        title: `Run ${res.data.id} cancelled`,
        description: "Execution stopped and resources cleaned up.",
        variant: "info",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to cancel run",
        description: err.message,
        variant: "error",
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () =>
      apiClient.retryRun(runId!, {
        ...(run?.isSimulated ? { simulatedOutcome: retryOutcome } : {}),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast({
        title: `Started retry run ${res.data.id}`,
        description: `Previous run ${runId} history is preserved.`,
        variant: "success",
      });
      setRetryModalOpen(false);
      navigate(`/runs/${res.data.id}`);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to retry run",
        description: err.message,
        variant: "error",
      });
    },
  });

  const copyAllDisplayedLogs = async () => {
    const formatted = logs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.eventType}] ${l.message}`
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
      toast({
        title: `Copied ${logs.length} log line(s) to clipboard`,
        variant: "success",
      });
    } catch {
      // Ignore clipboard error
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-xs text-zinc-400">
        Loading agent execution details...
      </div>
    );
  }

  if (isError || !run) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-zinc-900 p-8 text-center space-y-3">
        <p className="text-sm font-medium text-rose-300">
          Agent run "{runId}" was not found.
        </p>
        <Link
          to="/runs"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3.5 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Agent Runs</span>
        </Link>
      </div>
    );
  }

  const levelBadgeStyles: Record<LogLevel, string> = {
    debug: "bg-zinc-800 text-zinc-400 border-zinc-700",
    info: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    error: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link
                to="/runs"
                className="text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Agent Runs</span>
              </Link>
              <span className="text-zinc-600">/</span>
              <Link
                to={`/projects/${run.projectId}`}
                className="text-indigo-400 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <FolderKanban className="w-3.5 h-3.5" />
                <span>{run.projectName}</span>
              </Link>
              <span className="text-zinc-600">/</span>
              <Link
                to={`/tasks/${run.taskId}`}
                className="text-emerald-400 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>{run.taskTitle}</span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold font-mono text-zinc-100">
                {run.id}
              </h1>
              <CopyButton value={run.id} />
              <RunStatusBadge status={run.status} />
              <ExecutionModeBadge isSimulated={run.isSimulated} />
              {run.retryOfRunId && (
                <Link
                  to={`/runs/${run.retryOfRunId}`}
                  className="rounded-md bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:text-indigo-300"
                >
                  Retry of {run.retryOfRunId}
                </Link>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={`/api/runs/${encodeURIComponent(run.id)}/export?format=json`}
              download={`agentdesk-${run.id}.json`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </a>

            <a
              href={`/api/runs/${encodeURIComponent(run.id)}/export?format=txt`}
              download={`agentdesk-${run.id}.txt`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export TXT</span>
            </a>

            {active ? (
              <button
                type="button"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{cancelMutation.isPending ? "Cancelling..." : "Cancel Run"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRetryModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Run</span>
              </button>
            )}
          </div>
        </div>

        {/* Metadata Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/80 text-xs">
          <div>
            <span className="text-zinc-500 block">Provider</span>
            <span className="font-medium text-zinc-200">{run.providerName}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Start Time</span>
            <span className="font-mono text-zinc-200">
              {formatDateTime(run.startedAt || run.createdAt)}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Duration</span>
            <span className="font-mono text-zinc-200">
              {formatDuration(run.durationMs)}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block">Exit Code</span>
            <span
              className={`font-mono font-semibold ${
                run.exitCode === 0
                  ? "text-emerald-400"
                  : run.exitCode !== null
                  ? "text-rose-400"
                  : "text-zinc-400"
              }`}
            >
              {run.exitCode !== null ? run.exitCode : "Pending"}
            </span>
          </div>
        </div>
      </div>

      {/* Simulated Transparency Notice */}
      {run.isSimulated && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          <Bot className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Simulated Demonstration Execution: </span>
            <span>
              This run was executed by the built-in Demo Simulator. Lifecycle stages and log messages are simulated to demonstrate AgentDesk's workflow and did not modify local repository files.
            </span>
          </div>
        </div>
      )}

      {/* Live Progress Banner while Run is Active */}
      {active && (
        <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                  Live Stage: {run.currentStage || "Running"}
                </span>
                <span className="text-xs font-mono text-indigo-200/80">
                  ({formatDuration(run.durationMs)})
                </span>
              </div>
              <p className="text-sm text-zinc-100">
                {run.latestMessage || "Processing task instructions..."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-600/20 px-3.5 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-600/30 shrink-0"
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Cancel Active Run</span>
          </button>
        </div>
      )}

      {/* Diagnostic Error Presentation when Run Failed or Timed Out */}
      {(run.status === "failed" || run.status === "timed_out") && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/25 p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-rose-300">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <h2 className="text-sm font-semibold">
                Execution Failure Diagnostics ({run.status === "timed_out" ? "Timed Out" : "Failed"})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setRetryModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 self-start sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Execution</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-zinc-950/70 rounded-lg border border-rose-500/20 p-3.5">
            <div>
              <span className="text-zinc-400 block">Failure Stage</span>
              <span className="font-semibold text-rose-200">
                {run.currentStage || "Execution"}
              </span>
            </div>
            <div>
              <span className="text-zinc-400 block">Exit Code</span>
              <span className="font-mono font-semibold text-rose-300">
                {run.exitCode ?? 1}
              </span>
            </div>
            <div>
              <span className="text-zinc-400 block">Error Explanation</span>
              <span className="text-rose-200">
                {run.errorMessage || "Execution terminated with non-zero status."}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Execution Summary & Instructions Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-2.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-zinc-100">
              Execution Summary
            </h2>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            {run.summary ||
              run.errorMessage ||
              run.latestMessage ||
              "Execution is currently in progress."}
          </p>
        </div>

        <div className="lg:col-span-6 rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">
              Task Instructions Snapshot
            </h2>
            <CopyButton value={run.instructionsSnapshot} label="Copy Instructions" />
          </div>
          <p className="text-xs font-mono text-zinc-300 whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 max-h-28 overflow-y-auto">
            {run.instructionsSnapshot}
          </p>
        </div>
      </div>

      {/* Structured Logs & Execution Timeline */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden flex flex-col">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-100">
              Execution Timeline & Structured Logs ({logs.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Search within run logs"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search log messages..."
                className="rounded-lg border border-zinc-800 bg-zinc-950 pl-8 pr-2.5 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <select
              aria-label="Filter by log level"
              value={logLevelFilter}
              onChange={(e) => setLogLevelFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200"
            >
              <option value="">All Levels</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>

            <label className="inline-flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer px-2 py-1 rounded-lg border border-zinc-800 bg-zinc-950">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-zinc-700"
              />
              <span>Auto-scroll</span>
            </label>

            <button
              type="button"
              onClick={copyAllDisplayedLogs}
              disabled={logs.length === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-700 disabled:opacity-40"
            >
              {copiedAll ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied All</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Logs</span>
                </>
              )}
            </button>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            {logSearch || logLevelFilter
              ? "No log events matched your filter criteria."
              : "No log events recorded yet."}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60 bg-zinc-950/80 font-mono text-xs max-h-[520px] overflow-y-auto">
            {logs.map((log) => {
              const sourceTag = log.eventType.startsWith("simulated")
                ? "SIMULATED"
                : log.eventType === "stdout"
                ? "STDOUT"
                : log.eventType === "stderr"
                ? "STDERR"
                : "SYSTEM";

              return (
                <div
                  key={log.id}
                  className={`flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-zinc-900/80 ${
                    log.level === "error"
                      ? "bg-rose-950/20"
                      : log.level === "warn"
                      ? "bg-amber-950/15"
                      : ""
                  }`}
                >
                  <div className="flex flex-wrap sm:flex-nowrap items-start gap-2.5 min-w-0 flex-1">
                    <span className="text-zinc-500 shrink-0 select-none w-7 text-right">
                      #{log.sequence}
                    </span>
                    <span className="text-zinc-500 shrink-0 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-semibold uppercase border shrink-0 ${
                        levelBadgeStyles[log.level]
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="rounded bg-zinc-900 border border-zinc-800 px-1.5 py-0.2 text-[10px] text-zinc-400 shrink-0">
                      {sourceTag}:{log.eventType}
                    </span>
                    <span className="text-zinc-200 break-words leading-relaxed">
                      {log.message}
                    </span>
                  </div>

                  <CopyButton value={log.message} className="shrink-0 opacity-70 hover:opacity-100" />
                </div>
              );
            })}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Retry Configuration Modal */}
      <Modal
        open={retryModalOpen}
        onClose={() => setRetryModalOpen(false)}
        title={`Retry Run — ${run.taskTitle}`}
        description="Creates a new run record linked to the same task while preserving this run's historical logs."
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-300 leading-relaxed">
            Retrying will launch a fresh execution for task{" "}
            <strong className="text-zinc-100">"{run.taskTitle}"</strong> using{" "}
            <strong className="text-zinc-100">{run.providerName}</strong>.
          </p>

          {run.isSimulated && (
            <div>
              <label
                htmlFor="retry-sim-outcome"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                Simulated Outcome for Retry
              </label>
              <select
                id="retry-sim-outcome"
                value={retryOutcome}
                onChange={(e) =>
                  setRetryOutcome(
                    e.target.value as "completed" | "failed" | "timed_out"
                  )
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"
              >
                <option value="completed">Complete Successfully (Exit 0)</option>
                <option value="failed">Simulate Validation Failure (Exit 1)</option>
                <option value="timed_out">Simulate Timeout (Exit 124)</option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setRetryModalOpen(false)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>
                {retryMutation.isPending ? "Starting Retry..." : "Launch Retry Run"}
              </span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
