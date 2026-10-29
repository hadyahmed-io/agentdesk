import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Copy,
  FolderKanban,
  ListChecks,
  Play,
  Search,
  X,
} from "lucide-react";
import { apiClient } from "../services/api-client";
import type { AgentRun, Project, Task } from "../types/api";
import { RunStatusBadge, TaskStatusBadge } from "./badges";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidth} rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-zinc-100">
              {title}
            </h2>
            {description && <p className="text-xs text-zinc-400 mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = true,
  isLoading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  isLoading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5">
          <AlertTriangle
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              destructive ? "text-rose-400" : "text-amber-400"
            }`}
          />
          <p className="text-sm text-zinc-300 leading-relaxed">{description}</p>
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
              destructive
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {isLoading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function CopyButton({
  value,
  label,
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy ${label || value}`}
      className={`inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-emerald-400" />
          {label && <span className="text-emerald-400">Copied</span>}
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          {label && <span>{label}</span>}
        </>
      )}
    </button>
  );
}

export function GlobalSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    projects: Project[];
    tasks: Task[];
    runs: AgentRun[];
  }>({ projects: [], tasks: [], runs: [] });

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults({ projects: [], tasks: [], runs: [] });
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults({ projects: [], tasks: [], runs: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await apiClient.globalSearch(query.trim());
        setResults(res.data);
      } catch {
        // Ignore search error
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  if (!open) return null;

  const totalResults =
    results.projects.length + results.tasks.length + results.runs.length;

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global workspace search"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/75 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, tasks, or agent run IDs..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1.5 py-0.5 text-[11px] bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            ESC
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-3 space-y-4">
          {!query.trim() ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              Type to search across projects, tasks, and agent execution runs.
            </div>
          ) : loading ? (
            <div className="py-8 text-center text-xs text-zinc-400">
              Searching workspace...
            </div>
          ) : totalResults === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-400">
              No projects, tasks, or runs matched "{query}".
            </div>
          ) : (
            <>
              {results.projects.length > 0 && (
                <div>
                  <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Projects ({results.projects.length})
                  </p>
                  <div className="space-y-1">
                    {results.projects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => go(`/projects/${p.id}`)}
                        className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-800/80 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FolderKanban className="w-4 h-4 text-indigo-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-100 truncate">
                              {p.name}
                            </p>
                            <p className="text-xs text-zinc-400 truncate">
                              {p.description || "No description"}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] text-zinc-500 shrink-0">
                          {p.openTaskCount} open tasks
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.tasks.length > 0 && (
                <div>
                  <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Tasks ({results.tasks.length})
                  </p>
                  <div className="space-y-1">
                    {results.tasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => go(`/tasks/${t.id}`)}
                        className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-800/80 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ListChecks className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-100 truncate">
                              {t.title}
                            </p>
                            <p className="text-xs text-zinc-400 truncate">{t.projectName}</p>
                          </div>
                        </div>
                        <TaskStatusBadge status={t.status} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.runs.length > 0 && (
                <div>
                  <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Agent Runs ({results.runs.length})
                  </p>
                  <div className="space-y-1">
                    {results.runs.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => go(`/runs/${r.id}`)}
                        className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-800/80 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Play className="w-4 h-4 text-amber-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-mono text-zinc-100 truncate">
                              {r.id} — {r.taskTitle}
                            </p>
                            <p className="text-xs text-zinc-400 truncate">
                              {r.projectName} · {r.providerName}
                            </p>
                          </div>
                        </div>
                        <RunStatusBadge status={r.status} size="xs" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-rose-500/30 bg-zinc-900 p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              <h1 className="text-base font-semibold">Application Render Error</h1>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              AgentDesk encountered an unexpected UI error. Your local SQLite data is safe.
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = "/";
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
