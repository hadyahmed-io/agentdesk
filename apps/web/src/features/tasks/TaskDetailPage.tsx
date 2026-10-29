import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Edit3,
  FolderKanban,
  Play,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { apiClient } from "../../services/api-client";
import type { TaskPriority, TaskStatus } from "../../types/api";
import {
  formatDateTime,
  formatDuration,
  formatRelativeTime,
} from "../../lib/utils";
import {
  ExecutionModeBadge,
  RunStatusBadge,
  TaskPriorityBadge,
  TaskStatusBadge,
} from "../../components/badges";
import { ConfirmDialog, CopyButton } from "../../components/modals";
import { RunLauncherModal } from "../../components/run-launcher-modal";
import { useToast } from "../../components/toast";
import { TaskFormModal } from "./TaskFormModal";

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);

  const {
    data: taskRes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => apiClient.getTask(taskId!),
    enabled: Boolean(taskId),
    refetchInterval: 4000,
  });

  const { data: runsRes } = useQuery({
    queryKey: ["runs", { taskId }],
    queryFn: () => apiClient.listRuns({ taskId: taskId!, limit: 50 }),
    enabled: Boolean(taskId),
    refetchInterval: 2000,
  });

  const { data: activityRes } = useQuery({
    queryKey: ["activity", { entityId: taskId }],
    queryFn: () => apiClient.listActivity({ entityId: taskId!, limit: 30 }),
    enabled: Boolean(taskId),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: { status?: TaskStatus; priority?: TaskPriority }) =>
      apiClient.updateTask(taskId!, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast({
        title: "Task updated",
        variant: "success",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteTask(taskId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      toast({
        title: "Task deleted",
        variant: "info",
      });
      navigate("/tasks");
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-xs text-zinc-400">
        Loading task details...
      </div>
    );
  }

  const task = taskRes?.data;
  if (isError || !task) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-zinc-900 p-8 text-center space-y-3">
        <p className="text-sm font-medium text-rose-300">
          Task "{taskId}" was not found.
        </p>
        <Link
          to="/tasks"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3.5 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Tasks</span>
        </Link>
      </div>
    );
  }

  const runs = runsRes?.data ?? [];
  const activities = activityRes?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link
                to="/tasks"
                className="text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Tasks</span>
              </Link>
              <span className="text-zinc-600">/</span>
              <Link
                to={`/projects/${task.projectId}`}
                className="text-indigo-400 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <FolderKanban className="w-3.5 h-3.5" />
                <span>{task.projectName}</span>
              </Link>
              <span className="text-zinc-600">/</span>
              <CopyButton value={task.id} label={task.id} />
            </div>

            <h1 className="text-xl font-bold text-zinc-100">{task.title}</h1>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <TaskStatusBadge status={task.status} />
              <TaskPriorityBadge priority={task.priority} />
              {task.estimatedComplexity && (
                <span className="rounded-md bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                  Complexity: {task.estimatedComplexity}
                </span>
              )}
              {task.dueDate && (
                <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Due {task.dueDate}</span>
                </span>
              )}
              {task.labels.map((lbl) => (
                <span
                  key={lbl}
                  className="rounded bg-zinc-950 border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400"
                >
                  #{lbl}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              aria-label="Task status"
              value={task.status}
              onChange={(e) =>
                updateMutation.mutate({ status: e.target.value as TaskStatus })
              }
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
            >
              <option value="backlog">Backlog</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              aria-label="Task priority"
              value={task.priority}
              onChange={(e) =>
                updateMutation.mutate({
                  priority: e.target.value as TaskPriority,
                })
              }
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>

            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>

            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setLaunchOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 shadow-xs"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start Agent Run</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Description, Acceptance Criteria, Agent Instructions */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-100">
              Task Description
            </h2>
            <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {task.description || "No detailed description provided."}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-100">
              Acceptance Criteria ({task.acceptanceCriteria.length})
            </h2>
            {task.acceptanceCriteria.length === 0 ? (
              <p className="text-xs text-zinc-400">
                No explicit acceptance criteria defined yet. Click Edit to add verifiable criteria.
              </p>
            ) : (
              <ul className="space-y-2">
                {task.acceptanceCriteria.map((criterion, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3 text-xs text-zinc-200"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{criterion}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-100">
              Agent Execution Instructions
            </h2>
            <p className="text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
              {task.agentInstructions ||
                "No task-specific agent override instructions set. Will default to task title, description, and project instructions."}
            </p>
          </div>
        </div>

        {/* Right Column: Linked Agent Runs & Task Activity */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <TerminalSquare className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  Linked Agent Runs ({runs.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setLaunchOpen(true)}
                className="text-xs font-medium text-indigo-400 hover:underline"
              >
                + New Run
              </button>
            </div>

            {runs.length === 0 ? (
              <div className="p-6 text-center space-y-2.5">
                <p className="text-xs text-zinc-400">
                  No agent runs have been executed for this task yet.
                </p>
                <button
                  type="button"
                  onClick={() => setLaunchOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  <Play className="w-3 h-3" />
                  <span>Start First Run</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/70">
                {runs.map((run) => (
                  <div
                    key={run.id}
                    className="p-4 hover:bg-zinc-800/40 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to={`/runs/${run.id}`}
                        className="text-xs font-mono font-semibold text-indigo-400 hover:underline"
                      >
                        {run.id}
                      </Link>
                      <RunStatusBadge status={run.status} size="xs" />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                      <ExecutionModeBadge isSimulated={run.isSimulated} />
                      <span>
                        {formatDuration(run.durationMs)} ·{" "}
                        {formatRelativeTime(run.createdAt)}
                      </span>
                    </div>
                    {(run.summary || run.errorMessage || run.latestMessage) && (
                      <p className="text-xs text-zinc-300 line-clamp-2">
                        {run.summary || run.errorMessage || run.latestMessage}
                      </p>
                    )}
                    <div className="pt-1">
                      <Link
                        to={`/runs/${run.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:underline"
                      >
                        <span>Open Run Logs & Timeline</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-3 text-xs">
            <h2 className="text-sm font-semibold text-zinc-100">
              Task Metadata & History
            </h2>
            <div className="space-y-1.5 text-zinc-400 border-b border-zinc-800 pb-3">
              <p>
                Created:{" "}
                <span className="text-zinc-200">
                  {formatDateTime(task.createdAt)}
                </span>
              </p>
              <p>
                Last Updated:{" "}
                <span className="text-zinc-200">
                  {formatDateTime(task.updatedAt)}
                </span>
              </p>
              {task.completedAt && (
                <p>
                  Completed:{" "}
                  <span className="text-emerald-400">
                    {formatDateTime(task.completedAt)}
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Recent Task Activity
              </p>
              {activities.length === 0 ? (
                <p className="text-zinc-500">No activity events recorded.</p>
              ) : (
                activities.map((ev) => (
                  <div key={ev.id} className="space-y-0.5">
                    <p className="text-zinc-200 font-medium">{ev.title}</p>
                    <p className="text-zinc-500 text-[11px]">
                      {formatRelativeTime(ev.createdAt)} — {ev.description}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <TaskFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        task={task}
      />

      <RunLauncherModal
        open={launchOpen}
        onClose={() => setLaunchOpen(false)}
        task={task}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
        title={`Delete Task "${task.title}"?`}
        description="This will remove the task and its linked agent execution history."
        confirmLabel="Delete Task"
        destructive
      />
    </div>
  );
}
