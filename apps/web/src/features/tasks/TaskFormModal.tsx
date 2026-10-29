import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { apiClient } from "../../services/api-client";
import type { Task, TaskPriority, TaskStatus } from "../../types/api";
import { Modal } from "../../components/modals";
import { useToast } from "../../components/toast";

const taskFormSchema = z.object({
  projectId: z.string().trim().min(1, "Please select a project."),
  title: z
    .string()
    .trim()
    .min(1, "Task title is required.")
    .max(200, "Title must be 200 characters or fewer."),
  description: z.string().trim().max(5000).optional().default(""),
  status: z.enum([
    "backlog",
    "todo",
    "in_progress",
    "in_review",
    "done",
    "cancelled",
  ] as const),
  priority: z.enum(["low", "medium", "high", "urgent"] as const),
  labelsText: z.string().optional().default(""),
  agentInstructions: z.string().trim().max(5000).optional().default(""),
  dueDate: z.string().trim().optional().default(""),
  preferredProviderId: z.string().trim().optional().default("demo-agent"),
  estimatedComplexity: z
    .enum(["", "trivial", "small", "medium", "large", "epic"] as const)
    .optional()
    .default(""),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

export function TaskFormModal({
  open,
  onClose,
  task,
  defaultProjectId,
  onSuccessTask,
}: {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  defaultProjectId?: string;
  onSuccessTask?: (saved: Task) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isEditing = Boolean(task);

  const { data: projectsData } = useQuery({
    queryKey: ["projects", { archived: "false" }],
    queryFn: () => apiClient.listProjects({ archived: "false", limit: 100 }),
    enabled: open,
  });

  const { data: providersData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiClient.listProviders(),
    enabled: open,
  });

  const projects = projectsData?.data ?? [];
  const providers = providersData?.data ?? [];

  const [criteriaItems, setCriteriaItems] = useState<string[]>([""]);
  const [newCriterion, setNewCriterion] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      projectId: defaultProjectId || "",
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      labelsText: "",
      agentInstructions: "",
      dueDate: "",
      preferredProviderId: "demo-agent",
      estimatedComplexity: "medium",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (task) {
      reset({
        projectId: task.projectId,
        title: task.title,
        description: task.description || "",
        status: task.status,
        priority: task.priority,
        labelsText: task.labels.join(", "),
        agentInstructions: task.agentInstructions || "",
        dueDate: task.dueDate || "",
        preferredProviderId: task.preferredProviderId || "demo-agent",
        estimatedComplexity: task.estimatedComplexity || "",
      });
      setCriteriaItems(
        task.acceptanceCriteria.length > 0 ? [...task.acceptanceCriteria] : []
      );
    } else {
      reset({
        projectId: defaultProjectId || projects[0]?.id || "",
        title: "",
        description: "",
        status: "todo",
        priority: "medium",
        labelsText: "",
        agentInstructions: "",
        dueDate: "",
        preferredProviderId: "demo-agent",
        estimatedComplexity: "medium",
      });
      setCriteriaItems([]);
    }
    setNewCriterion("");
  }, [task, defaultProjectId, open, reset, projects]);

  const addCriterion = () => {
    const trimmed = newCriterion.trim();
    if (!trimmed) return;
    setCriteriaItems((prev) => [...prev, trimmed]);
    setNewCriterion("");
  };

  const removeCriterion = (idx: number) => {
    setCriteriaItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCriterion = (idx: number, val: string) => {
    setCriteriaItems((prev) => prev.map((item, i) => (i === idx ? val : item)));
  };

  const mutation = useMutation({
    mutationFn: (values: TaskFormValues) => {
      const labels = (values.labelsText || "")
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);

      const finalCriteria = [
        ...criteriaItems.map((c) => c.trim()).filter(Boolean),
        ...(newCriterion.trim() ? [newCriterion.trim()] : []),
      ];

      const payload = {
        projectId: values.projectId,
        title: values.title,
        description: values.description || "",
        status: values.status as TaskStatus,
        priority: values.priority as TaskPriority,
        labels,
        agentInstructions: values.agentInstructions?.trim() || null,
        acceptanceCriteria: finalCriteria,
        dueDate: values.dueDate?.trim() || null,
        preferredProviderId: values.preferredProviderId?.trim() || null,
        estimatedComplexity: (values.estimatedComplexity || null) as Task["estimatedComplexity"],
      };

      if (task) {
        return apiClient.updateTask(task.id, payload);
      }
      return apiClient.createTask(payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      if (task) {
        queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      }
      toast({
        title: isEditing ? "Task updated" : "Task created",
        description: `"${res.data.title}" saved in ${res.data.projectName}.`,
        variant: "success",
      });
      onClose();
      onSuccessTask?.(res.data);
    },
    onError: (err: Error) => {
      toast({
        title: isEditing ? "Failed to update task" : "Failed to create task",
        description: err.message,
        variant: "error",
      });
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `Edit Task — ${task?.title}` : "Create New Task"}
      description="Define development work, acceptance criteria, and instructions for coding agents."
      maxWidth="max-w-2xl"
    >
      <form
        onSubmit={handleSubmit((vals) => mutation.mutate(vals))}
        noValidate
        className="space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="task-project-select"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Project <span className="text-rose-400">*</span>
            </label>
            <select
              id="task-project-select"
              {...register("projectId")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {errors.projectId && (
              <p role="alert" className="text-xs text-rose-400 mt-1">
                {errors.projectId.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="task-provider-select"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Preferred Agent Provider
            </label>
            <select
              id="task-provider-select"
              {...register("preferredProviderId")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="task-title-input"
            className="block text-xs font-medium text-zinc-300 mb-1"
          >
            Task Title <span className="text-rose-400">*</span>
          </label>
          <input
            id="task-title-input"
            type="text"
            placeholder="e.g. Add project search with empty state"
            {...register("title")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
          {errors.title && (
            <p role="alert" className="text-xs text-rose-400 mt-1">
              {errors.title.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="task-status-select"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Status
            </label>
            <select
              id="task-status-select"
              {...register("status")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
            >
              <option value="backlog">Backlog</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="task-priority-select"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Priority
            </label>
            <select
              id="task-priority-select"
              {...register("priority")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="task-complexity-select"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Complexity
            </label>
            <select
              id="task-complexity-select"
              {...register("estimatedComplexity")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
            >
              <option value="">Unspecified</option>
              <option value="trivial">Trivial</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
              <option value="epic">Epic</option>
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="task-desc-input"
            className="block text-xs font-medium text-zinc-300 mb-1"
          >
            Description
          </label>
          <textarea
            id="task-desc-input"
            rows={2}
            placeholder="Context and functional requirements for this task..."
            {...register("description")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Multi-item Acceptance Criteria Builder */}
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3.5">
          <label className="block text-xs font-medium text-zinc-300">
            Acceptance Criteria ({criteriaItems.length} item{criteriaItems.length === 1 ? "" : "s"})
          </label>
          {criteriaItems.length > 0 && (
            <div className="space-y-1.5">
              {criteriaItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-zinc-500 w-5">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => updateCriterion(idx, e.target.value)}
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeCriterion(idx)}
                    aria-label={`Remove criterion ${idx + 1}`}
                    className="rounded p-1 text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newCriterion}
              onChange={(e) => setNewCriterion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCriterion();
                }
              }}
              placeholder="Add an acceptance criterion (e.g. Search is case-insensitive)..."
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={addCriterion}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="task-instructions-input"
            className="block text-xs font-medium text-zinc-300 mb-1"
          >
            Agent Instructions (Optional)
          </label>
          <textarea
            id="task-instructions-input"
            rows={2}
            placeholder="Specific prompt instructions or file targets for the coding agent..."
            {...register("agentInstructions")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="task-labels-input"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Labels (Comma-separated)
            </label>
            <input
              id="task-labels-input"
              type="text"
              placeholder="search, ux, validation"
              {...register("labelsText")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500"
            />
          </div>

          <div>
            <label
              htmlFor="task-duedate-input"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Due Date (Optional)
            </label>
            <input
              id="task-duedate-input"
              type="date"
              {...register("dueDate")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100"
            />
          </div>
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
              : "Create Task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
