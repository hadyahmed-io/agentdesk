import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Cpu, FolderGit2, Play, ShieldAlert } from "lucide-react";
import { apiClient } from "../services/api-client";
import type { Task } from "../types/api";
import { ExecutionModeBadge } from "./badges";
import { Modal } from "./modals";
import { useToast } from "./toast";

export function RunLauncherModal({
  open,
  onClose,
  task,
  defaultWorkingDirectory,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  defaultWorkingDirectory?: string | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: providersData } = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiClient.listProviders(),
    enabled: open,
  });

  const providers = providersData?.data ?? [];

  const [providerId, setProviderId] = useState<string>("demo-agent");
  const [instructions, setInstructions] = useState<string>("");
  const [simulatedOutcome, setSimulatedOutcome] = useState<
    "completed" | "failed" | "timed_out"
  >("completed");
  const [stepDelayMs, setStepDelayMs] = useState<number>(600);
  const [allowFileEdits, setAllowFileEdits] = useState<boolean>(false);

  useEffect(() => {
    if (task && open) {
      const preferred = providers.find((p) => p.id === task.preferredProviderId);
      const isPreferredReady =
        preferred &&
        preferred.enabled &&
        (preferred.kind === "demo" || preferred.isVerified);
      setProviderId(
        isPreferredReady && preferred ? preferred.id : "demo-agent"
      );
      setInstructions(
        task.agentInstructions ||
          (task.description
            ? `Task: ${task.title}\nDescription: ${task.description}`
            : `Task: ${task.title}\nExecute this task directly in the project workspace directory.`)
      );
      setSimulatedOutcome("completed");
      setStepDelayMs(600);
      setAllowFileEdits(false);
    }
  }, [task, open, providers]);

  const selectedProvider =
    providers.find((p) => p.id === providerId) ?? providers[0];
  const isSimulated = selectedProvider?.kind === "demo";

  const launchMutation = useMutation({
    mutationFn: () => {
      if (!task) throw new Error("No task selected");
      return apiClient.createRun({
        taskId: task.id,
        projectId: task.projectId,
        providerId,
        executionMode: isSimulated ? "demo" : "local",
        instructionsOverride: instructions,
        allowFileEdits: isSimulated ? false : allowFileEdits,
        ...(isSimulated
          ? {
              simulatedOutcome,
              stepDelayMs,
            }
          : {}),
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      toast({
        title: `Started run ${res.data.id}`,
        description: isSimulated
          ? "Running in Simulated Demo mode."
          : "Executing with Local CLI provider.",
        variant: "success",
      });
      onClose();
      navigate(`/runs/${res.data.id}`);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to start agent run",
        description: err.message,
        variant: "error",
      });
    },
  });

  if (!task) return null;

  const canStart =
    selectedProvider &&
    selectedProvider.enabled &&
    (selectedProvider.kind === "demo" || selectedProvider.isVerified);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Launch Agent Execution Run"
      description={`Configure and confirm execution parameters for task "${task.title}"`}
      maxWidth="max-w-xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canStart) launchMutation.mutate();
        }}
        className="space-y-4"
      >
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-400">Target Project & Task</span>
            {selectedProvider && (
              <ExecutionModeBadge isSimulated={selectedProvider.isSimulated} />
            )}
          </div>
          <p className="text-sm font-semibold text-zinc-100">
            {task.projectName} — {task.title}
          </p>
          {defaultWorkingDirectory && (
            <p className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-zinc-500" />
              <span>{defaultWorkingDirectory}</span>
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="run-provider-select"
            className="block text-xs font-medium text-zinc-300 mb-1.5"
          >
            Select Agent Provider
          </label>
          <select
            id="run-provider-select"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-indigo-500 focus:outline-none"
          >
            {providers.map((p) => {
              const isReady =
                p.enabled && (p.kind === "demo" || p.isVerified);
              return (
                <option key={p.id} value={p.id} disabled={!isReady}>
                  {p.name} (
                  {p.kind === "demo"
                    ? "Simulated Demo — Ready"
                    : !p.enabled
                    ? "Disabled"
                    : p.isVerified
                    ? "Verified Local CLI — Ready"
                    : "Unverified — Verify on Providers Page"}
                  )
                </option>
              );
            })}
          </select>
        </div>

        {selectedProvider && (
          <div
            className={`rounded-lg border p-3 text-xs leading-relaxed ${
              selectedProvider.isSimulated
                ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                : selectedProvider.isVerified
                ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            {selectedProvider.isSimulated ? (
              <div className="flex items-start gap-2">
                <Bot className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Simulated Demonstration Execution</p>
                  <p className="mt-0.5 text-amber-200/80">
                    This provider simulates multi-stage agent progress, structured logs, and outcomes without calling external AI APIs or modifying local repository files.
                  </p>
                </div>
              </div>
            ) : selectedProvider.isVerified ? (
              <div className="flex items-start gap-2">
                <Cpu className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    Genuine Local CLI Execution ({allowFileEdits ? "File Edits Allowed — Mode: accept-edits" : "Safe Read-Only — Mode: plan"})
                  </p>
                  <p className="mt-0.5 text-indigo-200/80">
                    Spawns a real local OS process with validated argument arrays inside the approved workspace directory and streams live stdout/stderr output.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Provider Not Verified</p>
                  <p className="mt-0.5 text-rose-200/80">
                    "{selectedProvider.name}" has not passed binary verification yet. Visit the Providers page and click "Verify Provider" before launching a run.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="run-instructions-input"
            className="block text-xs font-medium text-zinc-300 mb-1.5"
          >
            Task Instructions Snapshot
          </label>
          <textarea
            id="run-instructions-input"
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-mono text-zinc-100 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {!isSimulated && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={allowFileEdits}
                onChange={(e) => setAllowFileEdits(e.target.checked)}
                className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-zinc-200">
                  Allow agent to create and modify files in workspace (Mode: {allowFileEdits ? "accept-edits" : "plan"})
                </span>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {allowFileEdits
                    ? "Enabled: Execution runs with '--mode accept-edits'. The agent can create, write, and modify files directly in the project workspace."
                    : "Disabled (Default): Execution runs in safe read-only planning mode ('--mode plan'). The agent can inspect and analyze files, but cannot create or write files."}
                </p>
              </div>
            </label>
          </div>
        )}

        {isSimulated && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <div>
              <label
                htmlFor="sim-outcome-select"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                Simulated Outcome (Demo Testing)
              </label>
              <select
                id="sim-outcome-select"
                value={simulatedOutcome}
                onChange={(e) =>
                  setSimulatedOutcome(
                    e.target.value as "completed" | "failed" | "timed_out"
                  )
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
              >
                <option value="completed">Complete Successfully (Exit 0)</option>
                <option value="failed">Simulate Validation Failure (Exit 1)</option>
                <option value="timed_out">Simulate Step Timeout (Exit 124)</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="sim-delay-select"
                className="block text-xs font-medium text-zinc-300 mb-1"
              >
                Stage Pacing
              </label>
              <select
                id="sim-delay-select"
                value={stepDelayMs}
                onChange={(e) => setStepDelayMs(Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
              >
                <option value={250}>Fast (250ms / stage)</option>
                <option value={600}>Standard (600ms / stage)</option>
                <option value={1400}>Slow / Inspectable (1.4s / stage)</option>
              </select>
            </div>
          </div>
        )}

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
            disabled={!canStart || launchMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            <span>
              {launchMutation.isPending
                ? "Starting Run..."
                : isSimulated
                ? "Start Simulated Demo Run"
                : "Start Local CLI Run"}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
