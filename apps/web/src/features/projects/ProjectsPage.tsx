import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Edit3,
  FolderGit2,
  FolderKanban,
  LayoutGrid,
  List,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { apiClient } from "../../services/api-client";
import type { Project } from "../../types/api";
import { formatRelativeTime } from "../../lib/utils";
import { ExecutionModeBadge, RunStatusBadge } from "../../components/badges";
import { ConfirmDialog } from "../../components/modals";
import { useToast } from "../../components/toast";
import { ProjectFormModal } from "./ProjectFormModal";

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [search, setSearch] = useState("");
  const [archivedFilter, setArchivedFilter] = useState<"false" | "true" | "all">("false");
  const [tagFilter, setTagFilter] = useState("");
  const [sortBy, setSortBy] = useState<"updatedAt" | "createdAt" | "name">("updatedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "projects",
      { search, archived: archivedFilter, tag: tagFilter, sortBy, sortOrder },
    ],
    queryFn: () =>
      apiClient.listProjects({
        search: search.trim() || undefined,
        archived: archivedFilter,
        tag: tagFilter.trim() || undefined,
        sortBy,
        sortOrder,
        limit: 100,
      }),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      apiClient.updateProject(id, { archived }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast({
        title: res.data.archived ? "Project archived" : "Project restored",
        description: `"${res.data.name}" is now ${
          res.data.archived ? "archived" : "active"
        }.`,
        variant: "info",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteProject(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast({
        title: "Project permanently deleted",
        description: `Removed project along with ${res.data.tasksRemoved} task(s) and ${res.data.runsRemoved} run(s).`,
        variant: "info",
      });
      setDeletingProject(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to delete project",
        description: err.message,
        variant: "error",
      });
    },
  });

  const projects = data?.data ?? [];

  // Collect unique tags across projects for quick filtering
  const allTags = Array.from(
    new Set(projects.flatMap((p) => p.tags))
  ).slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Projects</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage software repositories, local workspace directories, and project-level agent instructions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Project</span>
        </button>
      </div>

      {/* Search, Filters & View Controls */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search projects"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects by name, description, language, or framework..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by archive status"
              value={archivedFilter}
              onChange={(e) =>
                setArchivedFilter(e.target.value as "false" | "true" | "all")
              }
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200"
            >
              <option value="false">Active Projects</option>
              <option value="true">Archived Only</option>
              <option value="all">All Projects</option>
            </select>

            <select
              aria-label="Sort projects by"
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [by, dir] = e.target.value.split(":");
                setSortBy(by as "updatedAt" | "createdAt" | "name");
                setSortOrder(dir as "asc" | "desc");
              }}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-200"
            >
              <option value="updatedAt:desc">Recently Updated</option>
              <option value="createdAt:desc">Newest Created</option>
              <option value="name:asc">Name (A–Z)</option>
              <option value="name:desc">Name (Z–A)</option>
            </select>

            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                aria-label="Table view"
                className={`rounded-md p-1.5 text-xs ${
                  viewMode === "table"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                aria-label="Card view"
                className={`rounded-md p-1.5 text-xs ${
                  viewMode === "cards"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {(allTags.length > 0 || search || tagFilter || archivedFilter !== "false") && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-500">Tags:</span>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter(tagFilter === tag ? "" : tag)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                    tagFilter === tag
                      ? "border-indigo-500/50 bg-indigo-500/20 text-indigo-300"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>

            {(search || tagFilter || archivedFilter !== "false") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setTagFilter("");
                  setArchivedFilter("false");
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Reset Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading / Error / Empty / Data Views */}
      {isLoading ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-xs text-zinc-400">
          Loading projects from local database...
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-500/30 bg-zinc-900 p-8 text-center space-y-3">
          <p className="text-sm text-rose-300">Failed to load projects.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200"
          >
            Retry
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-12 text-center space-y-3">
          <FolderKanban className="w-8 h-8 text-zinc-500 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-zinc-200">
              {search || tagFilter || archivedFilter !== "false"
                ? "No projects matched your active filters"
                : "No projects created yet"}
            </h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              {search || tagFilter || archivedFilter !== "false"
                ? "Try clearing your search query or switching the archive filter."
                : "Create your first project to organize tasks and execute simulated or local CLI agent runs."}
            </p>
          </div>
          {search || tagFilter || archivedFilter !== "false" ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setTagFilter("");
                setArchivedFilter("false");
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              Reset Filters
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Project</span>
            </button>
          )}
        </div>
      ) : viewMode === "table" ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-950/50">
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Stack & Tags</th>
                  <th className="py-3 px-4">Open Tasks</th>
                  <th className="py-3 px-4">Recent Runs</th>
                  <th className="py-3 px-4">Latest Status</th>
                  <th className="py-3 px-4">Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/projects/${p.id}`}
                          className="font-semibold text-sm text-zinc-100 hover:text-indigo-400 truncate"
                        >
                          {p.name}
                        </Link>
                        {p.archived && (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 border border-zinc-700">
                            Archived
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-400 truncate mt-0.5">
                        {p.description || "No description"}
                      </p>
                      {p.localPath && (
                        <p className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                          {p.localPath}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {p.language && (
                          <span className="rounded bg-indigo-500/10 border border-indigo-500/30 px-1.5 py-0.5 text-[11px] text-indigo-300">
                            {p.language}
                          </span>
                        )}
                        {p.framework && (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">
                            {p.framework}
                          </span>
                        )}
                        {p.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="rounded bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-zinc-200">
                      {p.openTaskCount}{" "}
                      <span className="text-zinc-500 font-normal">
                        / {p.totalTaskCount}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-300">{p.recentRunCount}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RunStatusBadge status={p.latestRunStatus} size="xs" />
                        {p.latestRunStatus && p.latestRunMode && (
                          <ExecutionModeBadge isSimulated={p.latestRunMode === "demo"} />
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 whitespace-nowrap">
                      {formatRelativeTime(p.updatedAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingProject(p)}
                          title="Edit project"
                          aria-label={`Edit ${p.name}`}
                          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            archiveMutation.mutate({
                              id: p.id,
                              archived: !p.archived,
                            })
                          }
                          title={p.archived ? "Restore project" : "Archive project"}
                          aria-label={
                            p.archived ? `Restore ${p.name}` : `Archive ${p.name}`
                          }
                          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        >
                          {p.archived ? (
                            <ArchiveRestore className="w-3.5 h-3.5" />
                          ) : (
                            <Archive className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingProject(p)}
                          title="Delete project"
                          aria-label={`Delete ${p.name}`}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 flex flex-col justify-between gap-4 hover:border-zinc-700 transition-colors"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/projects/${p.id}`}
                    className="text-base font-semibold text-zinc-100 hover:text-indigo-400"
                  >
                    {p.name}
                  </Link>
                  <RunStatusBadge status={p.latestRunStatus} size="xs" />
                </div>

                <p className="text-xs text-zinc-400 line-clamp-2">
                  {p.description || "No description provided."}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {p.language && (
                    <span className="rounded bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 text-[11px] text-indigo-300">
                      {p.language}
                    </span>
                  )}
                  {p.framework && (
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">
                      {p.framework}
                    </span>
                  )}
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
                    >
                      #{t}
                    </span>
                  ))}
                </div>

                {p.localPath && (
                  <p className="text-[11px] font-mono text-zinc-500 truncate flex items-center gap-1.5 pt-1">
                    <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{p.localPath}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3 text-xs text-zinc-400">
                <span>
                  <strong className="text-zinc-200">{p.openTaskCount}</strong> open tasks ·{" "}
                  <strong className="text-zinc-200">{p.recentRunCount}</strong> runs
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingProject(p)}
                    className="rounded p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingProject(p)}
                    className="rounded p-1 hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProjectFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccessProject={(created) => navigate(`/projects/${created.id}`)}
      />

      <ProjectFormModal
        open={Boolean(editingProject)}
        onClose={() => setEditingProject(null)}
        project={editingProject}
      />

      <ConfirmDialog
        open={Boolean(deletingProject)}
        onClose={() => setDeletingProject(null)}
        onConfirm={() => {
          if (deletingProject) deleteMutation.mutate(deletingProject.id);
        }}
        isLoading={deleteMutation.isPending}
        title={`Delete Project "${deletingProject?.name}"?`}
        description={`This will permanently delete "${deletingProject?.name}" along with its ${
          deletingProject?.totalTaskCount ?? 0
        } associated task(s), ${
          deletingProject?.recentRunCount ?? 0
        } agent execution run(s), and run logs. If you want to keep historical logs, archive the project instead.`}
        confirmLabel="Permanently Delete Project"
        destructive
      />
    </div>
  );
}
