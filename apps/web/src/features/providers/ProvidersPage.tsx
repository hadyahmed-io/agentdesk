import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  Power,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { apiClient } from "../../services/api-client";
import type { AgentProvider } from "../../types/api";
import { formatDateTime, formatRelativeTime } from "../../lib/utils";
import {
  ExecutionModeBadge,
  ProviderVerificationBadge,
} from "../../components/badges";
import { Modal } from "../../components/modals";
import { useToast } from "../../components/toast";

export function ProvidersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingProvider, setEditingProvider] = useState<AgentProvider | null>(
    null
  );
  const [stepDelayInput, setStepDelayInput] = useState<number>(600);
  const [timeoutInput, setTimeoutInput] = useState<number>(30000);
  const [outputFormatInput, setOutputFormatInput] = useState<string>("stream-json");
  const [sandboxInput, setSandboxInput] = useState<boolean>(true);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiClient.listProviders(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.updateProvider(id, { enabled }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      toast({
        title: `Provider "${res.data.name}" ${
          res.data.enabled ? "enabled" : "disabled"
        }`,
        variant: "info",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => {
      setTestingId(id);
      return apiClient.testProvider(id);
    },
    onSuccess: (res) => {
      setTestingId(null);
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      queryClient.invalidateQueries({ queryKey: ["health"] });
      toast({
        title: res.data.validation.valid
          ? `Verified "${res.data.provider.name}"`
          : `Verification failed for "${res.data.provider.name}"`,
        description: res.data.validation.message,
        variant: res.data.validation.valid ? "success" : "error",
      });
    },
    onError: (err: Error) => {
      setTestingId(null);
      toast({
        title: "Verification test error",
        description: err.message,
        variant: "error",
      });
    },
  });

  const configMutation = useMutation({
    mutationFn: () => {
      if (!editingProvider) throw new Error("No provider selected");
      const nextConfig =
        editingProvider.kind === "demo"
          ? {
              ...editingProvider.config,
              stepDelayMs: stepDelayInput,
            }
          : editingProvider.id === "google-antigravity-cli"
          ? {
              ...editingProvider.config,
              timeoutMs: timeoutInput,
              outputFormat: outputFormatInput,
              sandbox: sandboxInput,
            }
          : {
              ...editingProvider.config,
              timeoutMs: timeoutInput,
            };
      return apiClient.updateProvider(editingProvider.id, {
        config: nextConfig,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      toast({
        title: `Saved configuration for "${res.data.name}"`,
        variant: "success",
      });
      setEditingProvider(null);
    },
  });

  const openConfigModal = (p: AgentProvider) => {
    setEditingProvider(p);
    setStepDelayInput(Number(p.config.stepDelayMs ?? 600));
    setTimeoutInput(Number(p.config.timeoutMs ?? 30000));
    setOutputFormatInput(String(p.config.outputFormat ?? "stream-json"));
    setSandboxInput(p.config.sandbox !== false);
  };

  const providers = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">
          Agent Providers
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Configure and verify execution engines. AgentDesk never marks a provider as verified until an actual binary or runtime validation succeeds.
        </p>
      </div>

      {/* Transparency Info Card */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="flex items-start gap-3">
          <Bot className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-zinc-100">
              Mode A — Simulated Demo Provider
            </h2>
            <p className="text-zinc-400 mt-0.5 leading-relaxed">
              Works offline out-of-the-box without external API keys. Emits realistic lifecycle events, progress updates, and structured logs while clearly labeling all output as simulated.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Cpu className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-zinc-100">
              Mode B — Local CLI Process Adapters
            </h2>
            <p className="text-zinc-400 mt-0.5 leading-relaxed">
              Spawns allowlisted local executables with strict argument arrays (no shell interpolation) inside verified workspace directories, enforcing execution timeouts and secret redaction.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-12 text-center text-xs text-zinc-400">
          Loading configured providers...
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-500/30 bg-zinc-900 p-8 text-center text-xs text-rose-300">
          Failed to load providers.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {providers.map((provider) => {
            const isTesting =
              testMutation.isPending && testingId === provider.id;

            return (
              <div
                key={provider.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/70 p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-base font-semibold text-zinc-100">
                        {provider.name}
                      </h2>
                      <span className="font-mono text-xs text-zinc-500">
                        ({provider.id})
                      </span>
                      <ExecutionModeBadge isSimulated={provider.isSimulated} />
                      <ProviderVerificationBadge
                        isVerified={provider.isVerified}
                        enabled={provider.enabled}
                      />
                    </div>

                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {provider.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-zinc-400">
                      <span>
                        Type:{" "}
                        <strong className="text-zinc-200 font-mono">
                          {provider.kind}
                        </strong>
                      </span>
                      <span>
                        Installed:{" "}
                        <strong
                          className={
                            provider.installed === true
                              ? "text-emerald-400"
                              : provider.installed === false
                              ? "text-rose-400"
                              : "text-zinc-300"
                          }
                        >
                          {provider.installed === true
                            ? "Yes"
                            : provider.installed === false
                            ? "Not Installed"
                            : "Unchecked"}
                        </strong>
                      </span>
                      <span>
                        Authentication:{" "}
                        <strong
                          className={
                            !provider.requiresAuth
                              ? "text-emerald-400"
                              : provider.authenticated === true
                              ? "text-emerald-400"
                              : provider.authenticated === false
                              ? "text-amber-300"
                              : "text-zinc-300"
                          }
                        >
                          {!provider.requiresAuth
                            ? "Not Required"
                            : provider.authenticated === true
                            ? "Required (Ready)"
                            : provider.authenticated === false
                            ? "Required (Not Configured)"
                            : "Required (Unchecked)"}
                        </strong>
                      </span>
                      <span>
                        Streaming:{" "}
                        <strong className="text-zinc-200">
                          {provider.supportsStreaming !== false
                            ? "Supported"
                            : "No"}
                        </strong>
                      </span>
                      <span>
                        Cancellation:{" "}
                        <strong className="text-zinc-200">
                          {provider.supportsCancellation !== false
                            ? "Supported"
                            : "No"}
                        </strong>
                      </span>
                      <span>
                        Last Verified:{" "}
                        <strong className="text-zinc-200">
                          {provider.lastVerifiedAt
                            ? `${formatRelativeTime(
                                provider.lastVerifiedAt
                              )} (${formatDateTime(provider.lastVerifiedAt)})`
                            : "Never verified"}
                        </strong>
                      </span>
                    </div>

                    {provider.setupInstructions &&
                      provider.setupInstructions.length > 0 && (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 mt-2 space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                            Setup & Verification Instructions
                          </p>
                          <ol className="list-decimal list-inside space-y-1 text-xs text-zinc-300">
                            {provider.setupInstructions.map((step, idx) => (
                              <li key={idx} className="leading-relaxed">
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                    {provider.lastError && (
                      <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 mt-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold block">
                            Latest Verification / Runtime Error:
                          </span>
                          <span>{provider.lastError}</span>
                        </div>
                      </div>
                    )}

                    {provider.isVerified && !provider.lastError && (
                      <div className="flex items-center gap-2 text-xs text-emerald-300 pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          {provider.lastVerificationMessage ||
                            "Provider runtime check passed and ready for task execution."}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Provider Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => testMutation.mutate(provider.id)}
                      disabled={isTesting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {isTesting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isTesting ? "Testing..." : "Verify Provider"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openConfigModal(provider)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      <span>Configure</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        toggleMutation.mutate({
                          id: provider.id,
                          enabled: !provider.enabled,
                        })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        provider.enabled
                          ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                          : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{provider.enabled ? "Disable" : "Enable"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(editingProvider)}
        onClose={() => setEditingProvider(null)}
        title={`Configure Provider — ${editingProvider?.name}`}
        description="Update non-secret runtime parameters for this provider."
        maxWidth="max-w-md"
      >
        {editingProvider && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              configMutation.mutate();
            }}
            className="space-y-4"
          >
            {editingProvider.kind === "demo" ? (
              <div>
                <label
                  htmlFor="provider-step-delay"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  Default Simulated Stage Delay (ms)
                </label>
                <input
                  id="provider-step-delay"
                  type="number"
                  min={50}
                  max={5000}
                  value={stepDelayInput}
                  onChange={(e) => setStepDelayInput(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Controls how long each simulated lifecycle stage pauses before emitting the next event.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="provider-timeout-ms"
                    className="block text-xs font-medium text-zinc-300 mb-1"
                  >
                    Process Execution Timeout (ms)
                  </label>
                  <input
                    id="provider-timeout-ms"
                    type="number"
                    min={1000}
                    max={600000}
                    value={timeoutInput}
                    onChange={(e) => setTimeoutInput(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  />
                </div>

                {editingProvider.id === "google-antigravity-cli" && (
                  <>
                    <div>
                      <label
                        htmlFor="provider-output-format"
                        className="block text-xs font-medium text-zinc-300 mb-1"
                      >
                        Headless Output Format (--output-format)
                      </label>
                      <select
                        id="provider-output-format"
                        value={outputFormatInput}
                        onChange={(e) => setOutputFormatInput(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"
                      >
                        <option value="stream-json">
                          stream-json (NDJSON live progress events)
                        </option>
                        <option value="json">json (Single JSON payload)</option>
                        <option value="text">text (Plain stdout text)</option>
                      </select>
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sandboxInput}
                        onChange={(e) => setSandboxInput(e.target.checked)}
                      />
                      <span>
                        Enforce terminal sandbox (--sandbox) during CLI execution
                      </span>
                    </label>

                    <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                      Security Note: AgentDesk never stores Google OAuth tokens or API keys in provider database records. Authenticate locally with{" "}
                      <code className="font-mono">agy</code> or set{" "}
                      <code className="font-mono">GEMINI_API_KEY</code> in the server environment.
                    </p>
                  </>
                )}

                <p className="text-[11px] text-zinc-500 mt-1">
                  Updating a local CLI provider configuration requires re-running "Verify Provider".
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditingProvider(null)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={configMutation.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500"
              >
                Save Configuration
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
