import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../services/api-client";
import type { Project } from "../../types/api";
import { Modal } from "../../components/modals";
import { useToast } from "../../components/toast";

const projectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required.")
    .max(120, "Project name must be 120 characters or fewer."),
  description: z.string().trim().max(2000).optional().default(""),
  localPath: z.string().trim().max(500).optional().default(""),
  gitRepoUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (val) => {
        if (!val) return true;
        if (val.startsWith("git@") || val.startsWith("ssh://")) return true;
        try {
          const parsed = new URL(val);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Enter a valid HTTP(S) or SSH Git repository URL." }
    )
    .optional()
    .default(""),
  defaultBranch: z.string().trim().max(100).optional().default(""),
  language: z.string().trim().max(60).optional().default(""),
  framework: z.string().trim().max(60).optional().default(""),
  tagsText: z.string().optional().default(""),
  defaultProviderId: z.string().trim().optional().default("demo-agent"),
  agentInstructions: z.string().trim().max(5000).optional().default(""),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

export function ProjectFormModal({
  open,
  onClose,
  project,
  onSuccessProject,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project | null;
  onSuccessProject?: (saved: Project) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEditing = Boolean(project);

  const { data: providersData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiClient.listProviders(),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
      description: "",
      localPath: "",
      gitRepoUrl: "",
      defaultBranch: "main",
      language: "TypeScript",
      framework: "",
      tagsText: "",
      defaultProviderId: "demo-agent",
      agentInstructions: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (project) {
      reset({
        name: project.name,
        description: project.description || "",
        localPath: project.localPath || "",
        gitRepoUrl: project.gitRepoUrl || "",
        defaultBranch: project.defaultBranch || "",
        language: project.language || "",
        framework: project.framework || "",
        tagsText: project.tags.join(", "),
        defaultProviderId: project.defaultProviderId || "demo-agent",
        agentInstructions: project.agentInstructions || "",
      });
    } else {
      reset({
        name: "",
        description: "",
        localPath: "",
        gitRepoUrl: "",
        defaultBranch: "main",
        language: "TypeScript",
        framework: "",
        tagsText: "",
        defaultProviderId: "demo-agent",
        agentInstructions: "",
      });
    }
  }, [project, open, reset]);

  const mutation = useMutation({
    mutationFn: (values: ProjectFormValues) => {
      const tags = (values.tagsText || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        name: values.name,
        description: values.description || "",
        localPath: values.localPath?.trim() || null,
        gitRepoUrl: values.gitRepoUrl?.trim() || null,
        defaultBranch: values.defaultBranch?.trim() || null,
        language: values.language?.trim() || null,
        framework: values.framework?.trim() || null,
        tags,
        defaultProviderId: values.defaultProviderId?.trim() || null,
        agentInstructions: values.agentInstructions?.trim() || null,
      };

      if (project) {
        return apiClient.updateProject(project.id, payload);
      }
      return apiClient.createProject(payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      if (project) {
        queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      }
      toast({
        title: isEditing ? "Project updated" : "Project created",
        description: `"${res.data.name}" saved to local SQLite storage.`,
        variant: "success",
      });
      onClose();
      onSuccessProject?.(res.data);
    },
    onError: (err: Error) => {
      toast({
        title: isEditing ? "Failed to update project" : "Failed to create project",
        description: err.message,
        variant: "error",
      });
    },
  });

  const providers = providersData?.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `Edit Project — ${project?.name}` : "Create New Project"}
      description="Register a repository or development workspace to manage tasks and agent runs."
      maxWidth="max-w-2xl"
    >
      <form
        onSubmit={handleSubmit((vals) => mutation.mutate(vals))}
        noValidate
        className="space-y-4"
      >
        <div>
          <label
            htmlFor="project-name-input"
            className="block text-xs font-medium text-zinc-300 mb-1"
          >
            Project Name <span className="text-rose-400">*</span>
          </label>
          <input
            id="project-name-input"
            type="text"
            placeholder="e.g. TaskFlow API"
            {...register("name")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
          {errors.name && (
            <p role="alert" className="text-xs text-rose-400 mt-1">
              {errors.name.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="project-desc-input"
            className="block text-xs font-medium text-zinc-300 mb-1"
          >
            Description
          </label>
          <textarea
            id="project-desc-input"
            rows={2}
            placeholder="Concise summary of the project architecture and purpose..."
            {...register("description")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
          {errors.description && (
            <p role="alert" className="text-xs text-rose-400 mt-1">
              {errors.description.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="project-language-input"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Primary Language
            </label>
            <input
              id="project-language-input"
              type="text"
              placeholder="e.g. TypeScript, Python, Go"
              {...register("language")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="project-framework-input"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Framework / Stack
            </label>
            <input
              id="project-framework-input"
              type="text"
              placeholder="e.g. React + Express, FastAPI"
              {...register("framework")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="sm:col-span-2">
            <label
              htmlFor="project-git-input"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Git Repository URL (Optional)
            </label>
            <input
              id="project-git-input"
              type="url"
              placeholder="https://github.com/org/repo"
              {...register("gitRepoUrl")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
            {errors.gitRepoUrl && (
              <p role="alert" className="text-xs text-rose-400 mt-1">
                {errors.gitRepoUrl.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="project-branch-input"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Default Branch
            </label>
            <input
              id="project-branch-input"
              type="text"
              placeholder="main"
              {...register("defaultBranch")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="project-path-input"
            className="block text-xs font-medium text-zinc-300 mb-1"
          >
            Local Workspace Directory Path (Optional)
          </label>
          <input
            id="project-path-input"
            type="text"
            placeholder="Leave blank to auto-create workspaces/<project-name>"
            {...register("localPath")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            If left empty, AgentDesk automatically creates an isolated project folder under{" "}
            <code className="text-zinc-400">workspaces/&lt;project-name&gt;</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="project-tags-input"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Project Tags (Comma-separated)
            </label>
            <input
              id="project-tags-input"
              type="text"
              placeholder="api, backend, typescript"
              {...register("tagsText")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="project-provider-select"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Default Agent Provider
            </label>
            <select
              id="project-provider-select"
              {...register("defaultProviderId")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.kind === "demo" ? "Simulated" : "Local CLI"})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="project-instructions-input"
            className="block text-xs font-medium text-zinc-300 mb-1"
          >
            Project-Specific Agent Instructions (Optional)
          </label>
          <textarea
            id="project-instructions-input"
            rows={2}
            placeholder="Coding conventions, test requirements, or architectural boundaries for agents..."
            {...register("agentInstructions")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {mutation.isPending
              ? "Saving..."
              : isEditing
              ? "Save Changes"
              : "Create Project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
