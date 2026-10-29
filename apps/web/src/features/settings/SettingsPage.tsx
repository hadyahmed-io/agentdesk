import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Database,
  Download,
  FolderCheck,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { apiClient } from "../../services/api-client";
import type { AppSettings, WorkspaceValidationResult } from "../../types/api";
import { useToast } from "../../components/toast";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
  });

  const { data: providersRes } = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiClient.listProviders(),
  });

  const [formState, setFormState] = useState<AppSettings | null>(null);
  const [testPathInput, setTestPathInput] = useState<string>("");
  const [testPathResult, setTestPathResult] =
    useState<WorkspaceValidationResult | null>(null);

  useEffect(() => {
    if (data?.data.settings) {
      setFormState(data.data.settings);
      setTestPathInput(data.data.settings.approvedWorkspaceRoot);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<AppSettings>) =>
      apiClient.updateSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast({
        title: "Settings saved",
        description: "Preferences persisted to local SQLite database.",
        variant: "success",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to save settings",
        description: err.message,
        variant: "error",
      });
    },
  });

  const validatePathMutation = useMutation({
    mutationFn: (candidatePath: string) =>
      apiClient.validateWorkspace(candidatePath),
    onSuccess: (res) => {
      setTestPathResult(res.data);
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => apiClient.seedDemoData(),
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      toast({
        title: res.data.alreadySeeded
          ? "Demonstration dataset already present"
          : "Demonstration dataset loaded",
        description: res.data.alreadySeeded
          ? "No duplicate records were created."
          : `Added ${res.data.projectsCreated} demo projects, ${res.data.tasksCreated} demo tasks, and ${res.data.runsCreated} simulated runs.`,
        variant: "success",
      });
    },
  });

  const clearDemoMutation = useMutation({
    mutationFn: () => apiClient.clearDemoData(),
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      toast({
        title: "Demonstration data removed",
        description: `Removed ${res.data.projectsRemoved} demo project(s), ${res.data.tasksRemoved} demo task(s), and ${res.data.runsRemoved} simulated run(s).`,
        variant: "info",
      });
    },
  });

  const handleExportMetadata = async () => {
    try {
      const res = await apiClient.exportMetadata();
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agentdesk-workspace-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Exported workspace metadata",
        variant: "success",
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  };

  if (isLoading || !formState) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-xs text-zinc-400">
        Loading workspace settings...
      </div>
    );
  }

  const providers = providersRes?.data ?? [];
  const rootStatus = data?.data.workspaceStatus;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">
          Settings & Preferences
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Configure persistent application preferences, workspace directory confinement, and data export.
        </p>
      </div>

      {/* General & Execution Preferences */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate(formState);
        }}
        className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-6 space-y-5"
      >
        <h2 className="text-sm font-semibold text-zinc-100 border-b border-zinc-800 pb-3">
          General & Execution Preferences
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="setting-theme"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Interface Theme
            </label>
            <select
              id="setting-theme"
              value={formState.theme}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  theme: e.target.value as "dark" | "light",
                })
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"
            >
              <option value="dark">Dark (Default Developer Charcoal)</option>
              <option value="light">Light (High-Contrast Daylight)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="setting-default-provider"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Default Agent Provider
            </label>
            <select
              id="setting-default-provider"
              value={formState.defaultProviderId}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  defaultProviderId: e.target.value,
                })
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="setting-default-mode"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Default Execution Mode
            </label>
            <select
              id="setting-default-mode"
              value={formState.defaultExecutionMode}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  defaultExecutionMode: e.target.value as "demo" | "local",
                })
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"
            >
              <option value="demo">Simulated Demo</option>
              <option value="local">Local CLI</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="setting-timeout"
              className="block text-xs font-medium text-zinc-300 mb-1"
            >
              Default Execution Timeout (ms)
            </label>
            <input
              id="setting-timeout"
              type="number"
              min={1000}
              max={600000}
              value={formState.executionTimeoutMs}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  executionTimeoutMs: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"
            />
          </div>
        </div>

        {/* Workspace Confinement Setting */}
        <div className="pt-2 border-t border-zinc-800 space-y-2">
          <label
            htmlFor="setting-workspace-root"
            className="block text-xs font-medium text-zinc-300"
          >
            Approved Workspace Root Directory (Security Boundary)
          </label>
          <input
            id="setting-workspace-root"
            type="text"
            value={formState.approvedWorkspaceRoot}
            onChange={(e) =>
              setFormState({
                ...formState,
                approvedWorkspaceRoot: e.target.value,
              })
            }
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-mono text-zinc-100"
          />
          <p className="text-[11px] text-zinc-400">
            Local CLI agent runs are strictly confined to directories inside this root path. Paths outside this directory are rejected before spawning any child process.
          </p>
          {rootStatus && (
            <div
              className={`flex items-center gap-2 text-xs pt-1 ${
                rootStatus.valid ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {rootStatus.valid ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    Current workspace root exists and is accessible ({rootStatus.resolvedPath}).
                  </span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>{rootStatus.reason}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-2">
          <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={formState.logAutoScroll}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  logAutoScroll: e.target.checked,
                })
              }
            />
            <span>Auto-scroll live run logs by default</span>
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={formState.confirmDestructiveActions}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  confirmDestructiveActions: e.target.checked,
                })
              }
            />
            <span>Require confirmation dialogs for destructive actions</span>
          </label>
        </div>

        <div className="flex justify-end pt-3 border-t border-zinc-800">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {saveMutation.isPending ? "Saving..." : "Save Settings"}
            </span>
          </button>
        </div>
      </form>

      {/* Interactive Workspace Directory Validator */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            Workspace Path Confinement Tester
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Verify whether a candidate local directory exists and resolves inside your Approved Workspace Root.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            aria-label="Candidate workspace path"
            value={testPathInput}
            onChange={(e) => setTestPathInput(e.target.value)}
            placeholder="Enter directory path to validate..."
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-mono text-zinc-100"
          />
          <button
            type="button"
            onClick={() => validatePathMutation.mutate(testPathInput)}
            disabled={validatePathMutation.isPending || !testPathInput.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 shrink-0"
          >
            <FolderCheck className="w-3.5 h-3.5" />
            <span>Validate Path</span>
          </button>
        </div>

        {testPathResult && (
          <div
            className={`rounded-lg border p-3.5 text-xs ${
              testPathResult.valid
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            {testPathResult.valid ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Path verified: <strong>{testPathResult.resolvedPath}</strong> exists, is a directory, and is inside the approved workspace root.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Validation failed: {testPathResult.reason}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data & Demonstration Actions */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            Data Export & Demonstration Dataset
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Export workspace metadata as JSON (excluding secrets) or load the idempotent demonstration dataset.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportMetadata}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Workspace Metadata (JSON)</span>
          </button>

          <button
            type="button"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
          >
            <Database className="w-3.5 h-3.5" />
            <span>
              {seedMutation.isPending
                ? "Loading..."
                : "Load Demo Data"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => clearDemoMutation.mutate()}
            disabled={clearDemoMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {clearDemoMutation.isPending
                ? "Removing..."
                : "Remove Demo Data"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
