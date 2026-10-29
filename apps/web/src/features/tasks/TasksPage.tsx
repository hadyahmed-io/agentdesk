import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  Edit3,
  Kanban,
  List,
  ListChecks,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { apiClient } from "../../services/api-client";
import type { Task, TaskStatus } from "../../types/api";
import {
  formatRelativeTime,
  TASK_STATUS_LABELS,
} from "../../lib/utils";
import {
  ExecutionModeBadge,
  RunStatusBadge,
  TaskPriorityBadge,
  TaskStatusBadge,
} from "../../components/badges";
import { ConfirmDialog } from "../../components/modals";
import { RunLauncherModal } from "../../components/run-launcher-modal";
import { useToast } from "../../components/toast";
import { TaskFormModal } from "./TaskFormModal";

const KANBAN_COLUMNS: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
];

export function TasksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sortBy, setSortBy] = useState<"updatedAt" | "priority" | "dueDate" | "createdAt">(
    "updatedAt"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [launchTask, setLaunchTask] = useState<Task | null>(null);

  const { data: projectsRes } = useQuery({
    queryKey: ["projects", { archived: "all" }],
    queryFn: () => apiClient.listProjects({ archived: "all", limit: 100 }),
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "tasks",
      {
        search,
        projectId: projectFilter,
        status: statusFilter,
        priority: priorityFilter,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: () =>
      apiClient.listTasks({
        search: search.trim() || undefined,
        projectId: projectFilter || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        sortBy,
        sortOrder,
        limit: 100,
      }),
    refetchInterval: 4000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      apiClient.updateTask(id, { status }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast({
        title: `Moved "${res.data.title}" to ${TASK_STATUS_LABELS[res.data.status]}`,
        variant: "info",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast({
        title: "Task deleted",
        variant: "info",
      });
      setDeletingTask(null);
    },
  });

  const tasks = data?.data ?? [];
  const projects = projectsRes?.data ?? [];

  const hasFilters = Boolean(
    search || projectFilter || statusFilter || priorityFilter
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Tasks</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Coordinate development backlog, acceptance criteria, and launch coding agent runs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Task</span>
        </button>
      </div>

      {/* Filters & View Switcher */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search tasks"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks by title, description, project, or label..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter tasks by project"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
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
              aria-label="Filter tasks by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200"
            >
              <option value="">All Statuses</option>
              <option value="backlog">Backlog</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              aria-label="Filter tasks by priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200"
            >
              <option value="">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              aria-label="Sort tasks by"
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [by, dir] = e.target.value.split(":");
                setSortBy(
                  by as "updatedAt" | "priority" | "dueDate" | "createdAt"
                );
                setSortOrder(dir as "asc" | "desc");
              }}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200"
            >
              <option value="updatedAt:desc">Recently Updated</option>
              <option value="priority:desc">Highest Priority</option>
              <option value="dueDate:asc">Due Date (Soonest)</option>
              <option value="createdAt:desc">Newest Created</option>
            </select>

            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="List view"
                className={`rounded-md p-1.5 text-xs ${
                  viewMode === "list"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                aria-label="Kanban board view"
                className={`rounded-md p-1.5 text-xs ${
                  viewMode === "kanban"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
              </button>
            </div>

            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setProjectFilter("");
                  setStatusFilter("");
                  setPriorityFilter("");
                }}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 px-2 py-1"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-xs text-zinc-400">
          Loading tasks...
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-500/30 bg-zinc-900 p-8 text-center space-y-3">
          <p className="text-sm text-rose-300">Failed to load tasks.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200"
          >
            Retry
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-12 text-center space-y-3">
          <ListChecks className="w-8 h-8 text-zinc-500 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-zinc-200">
              {hasFilters ? "No tasks matched your active filters" : "No tasks created yet"}
            </h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              {hasFilters
                ? "Clear your filters to see all tasks across your workspace."
                : "Create a task inside a project to specify agent instructions, acceptance criteria, and launch executions."}
            </p>
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setProjectFilter("");
                setStatusFilter("");
                setPriorityFilter("");
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              Clear Filters
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Task</span>
            </button>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-950/50">
                  <th className="py-3 px-4">Task</th>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Criteria & Runs</th>
                  <th className="py-3 px-4">Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {tasks.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 max-w-sm">
                      <Link
                        to={`/tasks/${t.id}`}
                        className="font-semibold text-sm text-zinc-100 hover:text-indigo-400 block truncate"
                      >
                        {t.title}
                      </Link>
                      <p className="text-zinc-400 truncate mt-0.5">
                        {t.description || "No description"}
                      </p>
                      {t.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {t.labels.map((lbl) => (
                            <span
                              key={lbl}
                              className="rounded bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
                            >
                              {lbl}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <Link
                        to={`/projects/${t.projectId}`}
                        className="text-indigo-400 hover:underline font-medium"
                      >
                        {t.projectName}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        aria-label={`Status for ${t.title}`}
                        value={t.status}
                        onChange={(e) =>
                          statusMutation.mutate({
                            id: t.id,
                            status: e.target.value as TaskStatus,
                          })
                        }
                        className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                      >
                        <option value="backlog">Backlog</option>
                        <option value="todo">Todo</option>
                        <option value="in_progress">In Progress</option>
                        <option value="in_review">In Review</option>
                        <option value="done">Done</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4">
                      <TaskPriorityBadge priority={t.priority} />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          title="Acceptance criteria count"
                          className="inline-flex items-center gap-1 text-zinc-300"
                        >
                          <CheckSquare className="w-3.5 h-3.5 text-zinc-500" />
                          {t.acceptanceCriteria.length}
                        </span>
                        <span className="text-zinc-600">·</span>
                        {t.latestRunId ? (
                          <div className="inline-flex items-center gap-1.5">
                            <Link to={`/runs/${t.latestRunId}`}>
                              <RunStatusBadge status={t.latestRunStatus} size="xs" />
                            </Link>
                            {t.latestRunMode && (
                              <ExecutionModeBadge isSimulated={t.latestRunMode === "demo"} />
                            )}
                          </div>
                        ) : (
                          <RunStatusBadge status={null} size="xs" />
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 whitespace-nowrap">
                      {formatRelativeTime(t.updatedAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLaunchTask(t)}
                          title="Launch agent run"
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
                        >
                          <Play className="w-3 h-3" />
                          <span>Run</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTask(t)}
                          title="Edit task"
                          aria-label={`Edit ${t.title}`}
                          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingTask(t)}
                          title="Delete task"
                          aria-label={`Delete ${t.title}`}
                          className="rounded p-1.5 text-zinc-400 hover:bg-rose-500/15 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Kanban Board View */
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto pb-2">
          {KANBAN_COLUMNS.map((colStatus) => {
            const colTasks = tasks.filter((t) => t.status === colStatus);
            return (
              <div
                key={colStatus}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const draggedId = e.dataTransfer.getData("text/plain");
                  if (draggedId) {
                    statusMutation.mutate({ id: draggedId, status: colStatus });
                  }
                }}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3 flex flex-col gap-3 min-h-[380px]"
              >
                <div className="flex items-center justify-between px-1">
                  <TaskStatusBadge status={colStatus} />
                  <span className="text-xs font-mono text-zinc-500">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1">
                  {colTasks.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", t.id)
                      }
                      className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2.5 shadow-xs hover:border-zinc-700 cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          to={`/tasks/${t.id}`}
                          className="text-xs font-semibold text-zinc-100 hover:text-indigo-400 leading-snug"
                        >
                          {t.title}
                        </Link>
                        <TaskPriorityBadge priority={t.priority} />
                      </div>

                      <p className="text-[11px] text-indigo-400 truncate">
                        {t.projectName}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                        <select
                          aria-label={`Change status for ${t.title}`}
                          value={t.status}
                          onChange={(e) =>
                            statusMutation.mutate({
                              id: t.id,
                              status: e.target.value as TaskStatus,
                            })
                          }
                          className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[11px] text-zinc-300"
                        >
                          <option value="backlog">Backlog</option>
                          <option value="todo">Todo</option>
                          <option value="in_progress">In Progress</option>
                          <option value="in_review">In Review</option>
                          <option value="done">Done</option>
                          <option value="cancelled">Cancelled</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => setLaunchTask(t)}
                          className="inline-flex items-center gap-1 rounded bg-indigo-600/20 border border-indigo-500/30 px-2 py-0.5 text-[11px] text-indigo-300 hover:bg-indigo-600/30"
                        >
                          <Play className="w-2.5 h-2.5" />
                          <span>Run</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccessTask={(created) => navigate(`/tasks/${created.id}`)}
      />

      <TaskFormModal
        open={Boolean(editingTask)}
        onClose={() => setEditingTask(null)}
        task={editingTask}
      />

      <RunLauncherModal
        open={Boolean(launchTask)}
        onClose={() => setLaunchTask(null)}
        task={launchTask}
      />

      <ConfirmDialog
        open={Boolean(deletingTask)}
        onClose={() => setDeletingTask(null)}
        onConfirm={() => {
          if (deletingTask) deleteMutation.mutate(deletingTask.id);
        }}
        isLoading={deleteMutation.isPending}
        title={`Delete Task "${deletingTask?.title}"?`}
        description={`Are you sure you want to delete "${deletingTask?.title}" and its ${
          deletingTask?.runCount ?? 0
        } linked agent run(s)?`}
        confirmLabel="Delete Task"
        destructive
      />
    </div>
  );
}
