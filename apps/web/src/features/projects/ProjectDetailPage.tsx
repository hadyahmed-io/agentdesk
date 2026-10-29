import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  ExternalLink,
  FolderGit2,
  GitBranch,
  ListChecks,
  Play,
  Plus,
  Settings,
  ShieldAlert,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { apiClient } from "../../services/api-client";
import type { Task, TaskStatus } from "../../types/api";
import { formatDuration, formatRelativeTime } from "../../lib/utils";
import {
  ExecutionModeBadge,
  RunStatusBadge,
  TaskPriorityBadge,
  TaskStatusBadge,
} from "../../components/badges";
import { ConfirmDialog, CopyButton } from "../../components/modals";
import { RunLauncherModal } from "../../components/run-launcher-modal";
import { useToast } from "../../components/toast";
import { TaskFormModal } from "../tasks/TaskFormModal";
import { ProjectFormModal } from "./ProjectFormModal";

type ProjectTab = "overview" | "tasks" | "runs" | "activity" | "settings";

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<ProjectTab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [launchTask, setLaunchTask] = useState<Task | null>(null);

  const {
    data: projectRes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiClient.getProject(projectId!),
    enabled: Boolean(projectId),
  });

  const { data: tasksRes } = useQuery({
    queryKey: ["tasks", { projectId }],
    queryFn: () => apiClient.listTasks({ projectId: projectId!, limit: 100 }),
    enabled: Boolean(projectId),
    refetchInterval: 4000,
  });

  const { data: runsRes } = useQuery({
    queryKey: ["runs", { projectId }],
    queryFn: () => apiClient.listRuns({ projectId: projectId!, limit: 50 }),
    enabled: Boolean(projectId),
    refetchInterval: 2500,
  });

  const { data: activityRes } = useQuery({
    queryKey: ["activity", { projectId }],
    queryFn: () => apiClient.listActivity({ projectId: projectId!, limit: 50 }),
    enabled: Boolean(projectId),
  });

  const project = projectRes?.data;

  const { data: pathCheckRes } = useQuery({
    queryKey: ["workspace-check", project?.localPath],
    queryFn: () => apiClient.validateWorkspace(project!.localPath!),
    enabled: Boolean(project?.localPath),
  });

  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      apiClient.updateTask(taskId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) =>
      apiClient.updateProject(projectId!, { archived }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({
        title: res.data.archived ? "Project archived" : "Project restored",
        variant: "info",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteProject(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      toast({
        title: "Project deleted",
        variant: "info",
      });
      navigate("/projects");
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-xs text-zinc-400">
        Loading project workspace...
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-zinc-900 p-8 text-center space-y-3">
        <p className="text-sm font-medium text-rose-300">
          Project "{projectId}" was not found.
        </p>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3.5 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Projects</span>
        </Link>
      </div>
    );
  }

  const tasks = tasksRes?.data ?? [];
  const runs = runsRes?.data ?? [];
  const activities = activityRes?.data ?? [];
  const pathCheck = pathCheckRes?.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to="/projects"
                className="text-xs text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Projects</span>
              </Link>
              <span className="text-zinc-600">/</span>
              <h1 className="text-xl font-bold text-zinc-100">{project.name}</h1>
              {project.archived && (
                <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs text-amber-300">
                  Archived
                </span>
              )}
              <CopyButton value={project.id} label={project.id} />
            </div>
            <p className="text-xs text-zinc-300 max-w-3xl leading-relaxed">
              {project.description || "No project description provided."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
              onClick={() => setCreateTaskOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Task</span>
            </button>
          </div>
        </div>

        {/* Metadata Chips */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-800/80 text-xs text-zinc-400">
          {project.language && (
            <span className="rounded-md bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-indigo-300 font-medium">
              {project.language}
            </span>
          )}
          {project.framework && (
            <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-zinc-300">
              {project.framework}
            </span>
          )}
          {project.defaultBranch && (
            <span className="inline-flex items-center gap-1 text-zinc-400">
              <GitBranch className="w-3.5 h-3.5" />
              <span>{project.defaultBranch}</span>
            </span>
          )}
          {project.gitRepoUrl && (
            <a
              href={project.gitRepoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-indigo-400 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{project.gitRepoUrl}</span>
            </a>
          )}
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-zinc-950 border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800 overflow-x-auto">
        {(
          [
            { id: "overview", label: "Overview", icon: FolderGit2 },
            { id: "tasks", label: `Tasks (${tasks.length})`, icon: ListChecks },
            { id: "runs", label: `Agent Runs (${runs.length})`, icon: TerminalSquare },
            { id: "activity", label: "Activity", icon: Activity },
            { id: "settings", label: "Settings", icon: Settings },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                active
                  ? "border-indigo-500 text-indigo-300"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            {/* Project Tasks Summary */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Current Project Tasks ({tasks.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab("tasks")}
                  className="text-xs text-indigo-400 hover:underline"
                >
                  View all tasks
                </button>
              </div>
              {tasks.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <p className="text-xs text-zinc-400">
                    No tasks added to this project yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreateTaskOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add First Task</span>
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/70">
                  {tasks.slice(0, 5).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/tasks/${task.id}`}
                          className="text-xs font-semibold text-zinc-100 hover:text-indigo-400 block truncate"
                        >
                          {task.title}
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                          <TaskStatusBadge status={task.status} />
                          <TaskPriorityBadge priority={task.priority} />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLaunchTask(task)}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20 shrink-0"
                      >
                        <Play className="w-3 h-3" />
                        <span>Run Agent</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Runs Summary */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Recent Agent Executions ({runs.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab("runs")}
                  className="text-xs text-indigo-400 hover:underline"
                >
                  View all runs
                </button>
              </div>
              {runs.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-400">
                  No agent runs executed for this project yet.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/70">
                  {runs.slice(0, 5).map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/runs/${run.id}`}
                            className="text-xs font-mono font-semibold text-indigo-400 hover:underline"
                          >
                            {run.id}
                          </Link>
                          <RunStatusBadge status={run.status} size="xs" />
                          <ExecutionModeBadge isSimulated={run.isSimulated} />
                        </div>
                        <p className="text-xs text-zinc-300 truncate mt-1">
                          {run.taskTitle}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-zinc-400 shrink-0">
                        {formatDuration(run.durationMs)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Metadata & Instructions Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-zinc-100">
                Workspace Directory & Security Status
              </h2>
              {project.localPath ? (
                <div className="space-y-2">
                  <p className="text-xs font-mono text-zinc-300 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 break-all">
                    {project.localPath}
                  </p>
                  {pathCheck && (
                    <div
                      className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                        pathCheck.valid
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                      }`}
                    >
                      {pathCheck.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <span>
                        {pathCheck.valid
                          ? "Verified directory inside approved workspace root."
                          : pathCheck.reason}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">
                  No local directory path configured. Simulated demo runs work without a local path; configure a path to use Local CLI providers.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 space-y-2.5">
              <h2 className="text-sm font-semibold text-zinc-100">
                Project Agent Instructions
              </h2>
              <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 font-mono">
                {project.agentInstructions ||
                  "No project-specific instructions defined. Tasks will use their own instructions."}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "tasks" && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-zinc-100">
              Tasks in {project.name} ({tasks.length})
            </h2>
            <button
              type="button"
              onClick={() => setCreateTaskOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Task</span>
            </button>
          </div>
          {tasks.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              No tasks in this project yet.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-zinc-800/40"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/tasks/${task.id}`}
                        className="text-sm font-semibold text-zinc-100 hover:text-indigo-400"
                      >
                        {task.title}
                      </Link>
                      <TaskPriorityBadge priority={task.priority} />
                      <RunStatusBadge status={task.latestRunStatus} size="xs" />
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-1">
                      {task.description || "No description"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <select
                      aria-label={`Change status for ${task.title}`}
                      value={task.status}
                      onChange={(e) =>
                        statusMutation.mutate({
                          taskId: task.id,
                          status: e.target.value as TaskStatus,
                        })
                      }
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200"
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
                      onClick={() => setLaunchTask(task)}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                    >
                      <Play className="w-3 h-3" />
                      <span>Launch Run</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "runs" && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-zinc-100">
              Execution History for {project.name} ({runs.length})
            </h2>
          </div>
          {runs.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              No runs recorded for this project yet.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 hover:bg-zinc-800/40"
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
                      <span className="text-xs font-medium text-zinc-200">
                        {run.taskTitle}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 truncate">
                      {run.summary || run.errorMessage || run.latestMessage || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-400">
                    <span>{formatDuration(run.durationMs)}</span>
                    <span>{formatRelativeTime(run.createdAt)}</span>
                    <Link
                      to={`/runs/${run.id}`}
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-zinc-200 hover:bg-zinc-700"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden">
          <div className="border-b border-zinc-800 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-zinc-100">
              Project Activity Log ({activities.length})
            </h2>
          </div>
          {activities.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              No activity recorded for this project yet.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {activities.map((ev) => (
                <div key={ev.id} className="px-5 py-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200">
                      {ev.title}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatRelativeTime(ev.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{ev.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Project Metadata & Preferences
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Update repository paths, default branch, or agent instructions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Edit Metadata
            </button>
          </div>

          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                {project.archived ? "Restore Project" : "Archive Project"}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Archiving hides the project from default active views while preserving all tasks, runs, and logs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => archiveMutation.mutate(!project.archived)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              {project.archived ? (
                <>
                  <ArchiveRestore className="w-3.5 h-3.5" />
                  <span>Restore Project</span>
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5" />
                  <span>Archive Project</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-rose-400">
                Permanent Deletion
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Permanently deletes this project along with its {project.totalTaskCount} task(s) and {project.recentRunCount} run(s).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-rose-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Project</span>
            </button>
          </div>
        </div>
      )}

      <ProjectFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        project={project}
      />

      <TaskFormModal
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        defaultProjectId={project.id}
      />

      <RunLauncherModal
        open={Boolean(launchTask)}
        onClose={() => setLaunchTask(null)}
        task={launchTask}
        defaultWorkingDirectory={project.localPath}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
        title={`Delete Project "${project.name}"?`}
        description={`This will permanently delete "${project.name}", ${project.totalTaskCount} task(s), and ${project.recentRunCount} run(s).`}
        confirmLabel="Permanently Delete"
        destructive
      />
    </div>
  );
}
