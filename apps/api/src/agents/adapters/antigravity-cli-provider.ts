import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { redactSecrets, validateWorkspacePath } from "../../utils/security.js";
import type {
  AgentEvent,
  AgentProvider,
  AgentRunInput,
  AgentRunResult,
  ProviderValidationResult,
} from "../interfaces/provider.js";

export type SpawnFunction = (
  command: string,
  args: readonly string[],
  options: SpawnOptions
) => ChildProcess;

export interface AntigravityCliProviderOptions {
  spawnFn?: SpawnFunction;
  env?: NodeJS.ProcessEnv;
  homedir?: string;
  fsExistsSync?: (filePath: string) => boolean;
  fsReadFileSync?: (filePath: string) => string;
}

const AUTH_ERROR_REGEX =
  /\b(unauthenticated|authentication\s+required|authentication\s+failed|not\s+authenticated|login\s+required|please\s+authenticate|invalid\s+api\s+key|api_key_invalid|permission_denied|401\s+unauthorized|403\s+forbidden)\b/i;

function runProbeCommand(
  spawnFn: SpawnFunction,
  executable: string,
  args: string[],
  timeoutMs = 5000,
  env?: NodeJS.ProcessEnv
): Promise<{ ok: boolean; exitCode: number | null; stdout: string; stderr: string; error?: string; isMissingBinary?: boolean }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (res: {
      ok: boolean;
      exitCode: number | null;
      stdout: string;
      stderr: string;
      error?: string;
      isMissingBinary?: boolean;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };

    let child: ChildProcess;
    try {
      child = spawnFn(executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: env ?? process.env,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isMissing = /ENOENT|not found/i.test(msg);
      finish({
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: msg,
        isMissingBinary: isMissing,
      });
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore kill error
      }
      finish({
        ok: false,
        exitCode: null,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: `Timed out after ${timeoutMs}ms waiting for '${executable}'.`,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      const isMissing = err.code === "ENOENT" || /ENOENT|not found/i.test(err.message);
      finish({
        ok: false,
        exitCode: null,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: err.message,
        isMissingBinary: isMissing,
      });
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish({
          ok: true,
          exitCode: 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      } else {
        finish({
          ok: false,
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: `Process '${executable}' exited with code ${code}: ${(stderr || stdout).trim()}`,
        });
      }
    });
  });
}

function parseStreamJsonLine(rawLine: string): {
  parsed: boolean;
  stage?: string;
  eventType?: string;
  level?: "debug" | "info" | "warn" | "error";
  message?: string;
  isError?: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
} {
  const trimmed = rawLine.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return { parsed: false };
  }

  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const rawType = String(obj.type ?? obj.event ?? "message").toLowerCase();

    if (rawType === "init" && obj.init && typeof obj.init === "object") {
      const initObj = obj.init as Record<string, unknown>;
      const convId = String(obj.conversation_id ?? "session");
      const cwd = String(initObj.cwd ?? "");
      return {
        parsed: true,
        stage: "Initializing Antigravity Session",
        eventType: "antigravity.init",
        level: "info",
        message: redactSecrets(
          `Initialized Antigravity CLI session (${convId})${cwd ? ` in '${cwd}'` : ""}.`
        ),
        metadata: { conversationId: convId, cwd },
      };
    }

    if (rawType === "step_update" && obj.step_update && typeof obj.step_update === "object") {
      const step = obj.step_update as Record<string, unknown>;
      const stepType = String(step.step_type ?? "");
      const state = String(step.state ?? "");
      const stepIndex = Number(step.step_index ?? 0);

      if (stepType === "user_input") {
        return {
          parsed: true,
          stage: "Submitting Task Prompt",
          eventType: "antigravity.user_input",
          level: "info",
          message: "Submitted task instructions to Google Antigravity agent.",
        };
      }

      if (stepType === "tool") {
        const toolName = String(step.tool_name ?? "tool");
        const toolInfo =
          step.tool_info && typeof step.tool_info === "object"
            ? (step.tool_info as Record<string, unknown>)
            : {};
        const params = toolInfo.parameters ? JSON.stringify(toolInfo.parameters) : "";

        if (state === "ACTIVE") {
          return {
            parsed: true,
            stage: `Tool Call: ${toolName}`,
            eventType: "antigravity.tool_call",
            level: "info",
            message: redactSecrets(
              `[Step ${stepIndex}] Running tool '${toolName}'${params ? `: ${params}` : ""}`
            ),
            metadata: { tool: toolName, stepIndex, state },
          };
        }

        if (state === "ERROR" || toolInfo.error) {
          const errObj =
            toolInfo.error && typeof toolInfo.error === "object"
              ? (toolInfo.error as Record<string, unknown>)
              : {};
          const errMsg = redactSecrets(
            String(errObj.message ?? toolInfo.error ?? `Tool '${toolName}' failed.`)
          );
          return {
            parsed: true,
            stage: `Tool Error: ${toolName}`,
            eventType: "antigravity.tool_error",
            level: "warn",
            message: `[Step ${stepIndex}] Tool '${toolName}' error: ${errMsg}`,
            metadata: { tool: toolName, stepIndex, state },
          };
        }

        if (state === "DONE") {
          const outPreview = String(toolInfo.output ?? "Completed").slice(0, 300);
          return {
            parsed: true,
            stage: `Tool Completed: ${toolName}`,
            eventType: "antigravity.tool_done",
            level: "info",
            message: redactSecrets(
              `[Step ${stepIndex}] Completed tool '${toolName}': ${outPreview}`
            ),
            metadata: { tool: toolName, stepIndex, state },
          };
        }
      }

      if (stepType === "agent_response") {
        const delta = typeof step.text_delta === "string" ? step.text_delta : "";
        return {
          parsed: true,
          stage: "Agent Reasoning & Response",
          eventType:
            state === "DONE"
              ? "antigravity.agent_response_done"
              : "antigravity.agent_response_delta",
          level: "info",
          message: redactSecrets(delta),
          metadata: {
            stepIndex,
            state,
            isDelta: state !== "DONE",
            ...(typeof step.usage === "object" && step.usage ? { usage: step.usage } : {}),
          },
        };
      }
    }

    if (rawType === "error" || obj.status === "error" || typeof obj.error === "string") {
      const errMsg = redactSecrets(
        String(obj.error ?? obj.message ?? obj.content ?? "Antigravity CLI reported an execution error.")
      );
      return {
        parsed: true,
        stage: "Execution Error",
        eventType: "antigravity.error",
        level: "error",
        message: errMsg,
        isError: true,
        errorMessage: errMsg,
      };
    }

    if (rawType === "thought" || rawType === "thinking") {
      const text = redactSecrets(String(obj.thought ?? obj.content ?? obj.delta ?? obj.message ?? ""));
      return {
        parsed: true,
        stage: "Reasoning & Planning",
        eventType: "antigravity.thought",
        level: "info",
        message: text ? `[Thinking] ${text}` : "[Thinking] Analyzing workspace context...",
        metadata: { streamEvent: rawType },
      };
    }

    if (rawType === "tool_call" || rawType === "tool_use") {
      const toolName = String(obj.name ?? obj.tool ?? "tool");
      return {
        parsed: true,
        stage: `Tool Call: ${toolName}`,
        eventType: "antigravity.tool_call",
        level: "info",
        message: redactSecrets(`Invoking tool '${toolName}'`),
        metadata: { tool: toolName },
      };
    }

    if (rawType === "result" || rawType === "completion" || rawType === "done") {
      const rawSummary =
        typeof obj.result === "string"
          ? obj.result
          : typeof obj.response === "string"
          ? obj.response
          : typeof obj.content === "string"
          ? obj.content
          : typeof obj.text === "string"
          ? obj.text
          : typeof obj.message === "string"
          ? obj.message
          : obj.result && typeof obj.result === "object"
          ? (obj.result as Record<string, unknown>).content ??
            (obj.result as Record<string, unknown>).summary ??
            (obj.result as Record<string, unknown>).text ??
            JSON.stringify(obj.result)
          : "Completed task execution.";
      const summaryText = redactSecrets(String(rawSummary));
      return {
        parsed: true,
        stage: "Completing Execution",
        eventType: "antigravity.result",
        level: "info",
        message: summaryText,
        metadata: {
          streamEvent: rawType,
          ...(typeof obj.usage === "object" && obj.usage ? { usage: obj.usage } : {}),
        },
      };
    }

    const content = redactSecrets(
      String(obj.content ?? obj.delta ?? obj.text ?? obj.message ?? obj.response ?? trimmed)
    );
    return {
      parsed: true,
      stage: "Streaming Agent Output",
      eventType: `antigravity.${rawType.replace(/[^a-z0-9_.-]/g, "_")}`,
      level: "info",
      message: content,
    };
  } catch {
    return { parsed: false };
  }
}

export class AntigravityCliProvider implements AgentProvider {
  readonly id = "google-antigravity-cli";
  readonly name = "Google Antigravity CLI (agy)";
  readonly kind = "local_cli" as const;

  private readonly spawnFn: SpawnFunction;
  private readonly env: NodeJS.ProcessEnv;
  private readonly homedir: string;
  private readonly fsExistsSync: (filePath: string) => boolean;
  private readonly fsReadFileSync: (filePath: string) => string;

  private activeProcesses = new Map<string, ChildProcess>();
  private cancelledRuns = new Set<string>();

  constructor(options: AntigravityCliProviderOptions = {}) {
    this.spawnFn = options.spawnFn ?? spawn;
    this.env = options.env ?? process.env;
    this.homedir = options.homedir ?? os.homedir();
    this.fsExistsSync = options.fsExistsSync ?? fs.existsSync;
    this.fsReadFileSync =
      options.fsReadFileSync ?? ((p: string) => fs.readFileSync(p, "utf8"));
  }

  private getCliSettingsPath(): string {
    return path.join(this.homedir, ".gemini", "antigravity-cli", "settings.json");
  }

  private inspectAuthStatus(): {
    authenticated: boolean;
    method: string | null;
    configError?: string;
  } {
    const geminiKey = this.env.GEMINI_API_KEY?.trim();
    if (geminiKey && geminiKey.length > 0) {
      return { authenticated: true, method: "GEMINI_API_KEY" };
    }

    const adcEnabled = this.env.AGY_ADC_AUTH?.trim().toLowerCase();
    if (adcEnabled === "true" || adcEnabled === "1") {
      return { authenticated: true, method: "AGY_ADC_AUTH (Application Default Credentials)" };
    }

    const gacPath = this.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (gacPath && gacPath.length > 0) {
      if (!this.fsExistsSync(gacPath)) {
        return {
          authenticated: false,
          method: null,
          configError: `GOOGLE_APPLICATION_CREDENTIALS points to a non-existent file: '${gacPath}'.`,
        };
      }
      return { authenticated: true, method: "GOOGLE_APPLICATION_CREDENTIALS" };
    }

    const settingsPath = this.getCliSettingsPath();
    if (this.fsExistsSync(settingsPath)) {
      try {
        const raw = this.fsReadFileSync(settingsPath);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return {
            authenticated: false,
            method: null,
            configError: `Antigravity CLI settings file at '${settingsPath}' must contain a JSON object.`,
          };
        }
        if (parsed.authenticated === false || parsed.disabled === true) {
          return {
            authenticated: false,
            method: null,
            configError: `Antigravity CLI profile at '${settingsPath}' is marked as unauthenticated or disabled.`,
          };
        }
        return {
          authenticated: true,
          method: "Antigravity CLI Profile (~/.gemini/antigravity-cli/settings.json)",
        };
      } catch (err) {
        return {
          authenticated: false,
          method: null,
          configError: `Antigravity CLI settings file at '${settingsPath}' contains invalid JSON: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }
    }

    return { authenticated: false, method: null };
  }

  async validateConfiguration(
    config?: Record<string, unknown>
  ): Promise<ProviderValidationResult> {
    if (config) {
      const outputFormat = config.outputFormat;
      if (
        outputFormat !== undefined &&
        outputFormat !== "text" &&
        outputFormat !== "json" &&
        outputFormat !== "stream-json"
      ) {
        return {
          valid: false,
          message: `Invalid Antigravity CLI outputFormat '${String(
            outputFormat
          )}'. Supported values are 'stream-json', 'json', or 'text'.`,
          details: {
            executable: "agy",
            installed: false,
            authenticated: false,
            requiresAuth: true,
            supportsStreaming: true,
            supportsCancellation: true,
          },
        };
      }
    }

    const versionCheck = await runProbeCommand(
      this.spawnFn,
      "agy",
      ["--version"],
      5000,
      this.env
    );

    if (!versionCheck.ok) {
      const combinedOut = `${versionCheck.stdout}\n${versionCheck.stderr}`.trim();
      if (!versionCheck.isMissingBinary && AUTH_ERROR_REGEX.test(combinedOut)) {
        return {
          valid: false,
          message: `Google Antigravity CLI ('agy') reported an authentication failure: ${redactSecrets(
            combinedOut
          )}`,
          details: {
            executable: "agy",
            installed: true,
            authenticated: false,
            requiresAuth: true,
            supportsStreaming: true,
            supportsCancellation: true,
            error: redactSecrets(combinedOut),
          },
        };
      }

      const missingMsg = versionCheck.isMissingBinary
        ? "Executable 'agy' was not found on system PATH. Install the official Google Antigravity CLI ('agy') from https://antigravity.google/docs/getting-started?tab=cli and authenticate before running tasks."
        : `Google Antigravity CLI ('agy --version') failed: ${redactSecrets(
            versionCheck.error ?? "Unknown error"
          )}`;

      return {
        valid: false,
        message: missingMsg,
        details: {
          executable: "agy",
          installed: !versionCheck.isMissingBinary,
          authenticated: false,
          requiresAuth: true,
          supportsStreaming: true,
          supportsCancellation: true,
          error: redactSecrets(versionCheck.error ?? "Binary not found on PATH"),
        },
      };
    }

    const versionOutput = redactSecrets(
      versionCheck.stdout || versionCheck.stderr || "agy (verified)"
    );
    const authStatus = this.inspectAuthStatus();

    if (authStatus.configError) {
      return {
        valid: false,
        message: redactSecrets(authStatus.configError),
        details: {
          executable: "agy",
          version: versionOutput,
          installed: true,
          authenticated: false,
          requiresAuth: true,
          supportsStreaming: true,
          supportsCancellation: true,
          error: redactSecrets(authStatus.configError),
        },
      };
    }

    if (!authStatus.authenticated) {
      const unauthMessage =
        `Google Antigravity CLI (${versionOutput}) is installed, but authentication is not configured. ` +
        `Run 'agy' interactively once to complete Google Sign-In (~/.gemini/antigravity-cli/settings.json), ` +
        `or configure GEMINI_API_KEY / AGY_ADC_AUTH=true in the server environment.`;
      return {
        valid: false,
        message: unauthMessage,
        details: {
          executable: "agy",
          version: versionOutput,
          installed: true,
          authenticated: false,
          requiresAuth: true,
          supportsStreaming: true,
          supportsCancellation: true,
          error: "Authentication required",
        },
      };
    }

    return {
      valid: true,
      message: `Verified Google Antigravity CLI (${versionOutput}) via ${authStatus.method}. Headless execution ('agy -p --output-format stream-json') is ready.`,
      details: {
        executable: "agy",
        version: versionOutput,
        installed: true,
        authenticated: true,
        authMethod: authStatus.method,
        requiresAuth: true,
        supportsStreaming: true,
        supportsCancellation: true,
      },
    };
  }

  async execute(
    input: AgentRunInput,
    emit: (event: AgentEvent) => Promise<void>
  ): Promise<AgentRunResult> {
    // 1. Always enforce workspace path confinement first
    const targetDir = input.workingDirectory || input.approvedWorkspaceRoot;
    const pathValidation = validateWorkspacePath(
      targetDir,
      input.approvedWorkspaceRoot,
      true
    );

    if (!pathValidation.valid || !pathValidation.resolvedPath) {
      const reason =
        pathValidation.reason ?? "Workspace directory failed security validation.";
      await emit({
        timestamp: new Date().toISOString(),
        type: "antigravity.workspace_error",
        stage: "Validating Workspace Path",
        level: "error",
        message: `Workspace path validation failed: ${reason}`,
      });
      return {
        status: "failed",
        errorMessage: reason,
        exitCode: 1,
        failedStage: "Validating Workspace Path",
      };
    }

    // 2. Verify CLI binary & authentication status before spawning
    const verification = await this.validateConfiguration(input.providerConfig);
    if (!verification.valid) {
      await emit({
        timestamp: new Date().toISOString(),
        type: "antigravity.prerequisite_error",
        stage: "Verifying Antigravity CLI & Authentication",
        level: "error",
        message: verification.message,
        metadata: verification.details,
      });
      return {
        status: "failed",
        errorMessage: verification.message,
        exitCode: 127,
        failedStage: "Verifying Antigravity CLI & Authentication",
      };
    }

    const resolvedCwd = pathValidation.resolvedPath;
    const timeoutMs = Math.min(
      Math.max(
        Number(input.timeoutMs ?? input.providerConfig?.timeoutMs ?? 120000),
        1000
      ),
      600000
    );

    const outputFormatRaw = String(
      input.providerConfig?.outputFormat ?? "stream-json"
    );
    const outputFormat =
      outputFormatRaw === "json" || outputFormatRaw === "text"
        ? outputFormatRaw
        : "stream-json";

    const mode = input.allowFileEdits ? "accept-edits" : "plan";
    const useSandbox = input.providerConfig?.sandbox !== false;

    const criteriaSection =
      input.acceptanceCriteria && input.acceptanceCriteria.length > 0
        ? `\nAcceptance Criteria:\n${input.acceptanceCriteria
            .map((c, idx) => `${idx + 1}. ${c}`)
            .join("\n")}`
        : "";
    const promptPayload = `${input.instructions}${criteriaSection}`.trim();

    const args: string[] = [
      "--print",
      promptPayload,
      "--output-format",
      outputFormat,
      "--mode",
      mode,
    ];
    if (useSandbox) {
      args.push("--sandbox");
    }
    if (input.allowFileEdits) {
      args.push("--dangerously-skip-permissions");
    }

    await emit({
      timestamp: new Date().toISOString(),
      type: "antigravity.spawn",
      stage: "Spawning Google Antigravity CLI",
      level: "info",
      message: `Launching 'agy --print' in headless mode (outputFormat=${outputFormat}, mode=${mode}, sandbox=${useSandbox}) inside '${resolvedCwd}'.`,
      metadata: {
        executable: "agy",
        cwd: resolvedCwd,
        outputFormat,
        mode,
        sandbox: useSandbox,
        timeoutMs,
      },
    });

    return new Promise<AgentRunResult>((resolve) => {
      let settled = false;
      let timedOut = false;
      let detectedStreamError: string | null = null;
      let detectedAuthError: string | null = null;
      let lastResultSummary: string | null = null;
      let stderrSnippet = "";

      let child: ChildProcess;
      try {
        child = this.spawnFn("agy", args, {
          cwd: resolvedCwd,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          env: this.env,
        });
      } catch (err) {
        const msg = redactSecrets(err instanceof Error ? err.message : String(err));
        resolve({
          status: "failed",
          errorMessage: `Failed to spawn Google Antigravity CLI ('agy'): ${msg}`,
          exitCode: 127,
          failedStage: "Spawning Google Antigravity CLI",
        });
        return;
      }

      this.activeProcesses.set(input.runId, child);

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // Ignore kill error
        }
      }, timeoutMs);

      const finish = (result: AgentRunResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.activeProcesses.delete(input.runId);
        this.cancelledRuns.delete(input.runId);
        resolve(result);
      };

      let eventQueue = Promise.resolve();
      const enqueueEmit = (event: AgentEvent) => {
        eventQueue = eventQueue.then(() => emit(event)).catch(() => {});
      };

      let stdoutBuffer = "";
      let agentResponseBuffer = "";

      const flushAgentResponseBuffer = (stepMetadata?: Record<string, unknown>) => {
        const text = redactSecrets(agentResponseBuffer.trim());
        agentResponseBuffer = "";
        if (!text) return;
        lastResultSummary = text;
        enqueueEmit({
          timestamp: new Date().toISOString(),
          type: "antigravity.agent_response",
          stage: "Agent Response",
          level: "info",
          message: text,
          metadata: { stream: "stdout", ...(stepMetadata ?? {}) },
        });
      };

      const processStdoutLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        if (AUTH_ERROR_REGEX.test(trimmed)) {
          detectedAuthError = redactSecrets(trimmed);
        }

        const parsedEvent = parseStreamJsonLine(trimmed);
        if (parsedEvent.parsed) {
          if (parsedEvent.eventType === "antigravity.agent_response_delta") {
            agentResponseBuffer += parsedEvent.message ?? "";
            return;
          }
          if (parsedEvent.eventType === "antigravity.agent_response_done") {
            agentResponseBuffer += parsedEvent.message ?? "";
            flushAgentResponseBuffer(parsedEvent.metadata);
            return;
          }

          if (agentResponseBuffer.trim().length > 0) {
            flushAgentResponseBuffer();
          }

          if (!parsedEvent.message) {
            return;
          }

          if (parsedEvent.isError) {
            detectedStreamError = parsedEvent.errorMessage ?? parsedEvent.message;
          } else if (parsedEvent.eventType === "antigravity.result") {
            lastResultSummary = parsedEvent.message;
          }
          enqueueEmit({
            timestamp: new Date().toISOString(),
            type: parsedEvent.eventType ?? "stdout",
            stage: parsedEvent.stage ?? "Executing Google Antigravity CLI",
            level: parsedEvent.level ?? "info",
            message: parsedEvent.message,
            metadata: { stream: "stdout", ...(parsedEvent.metadata ?? {}) },
          });
          return;
        }

        const safeLine = redactSecrets(trimmed);
        lastResultSummary = safeLine;
        enqueueEmit({
          timestamp: new Date().toISOString(),
          type: "stdout",
          stage: "Executing Google Antigravity CLI",
          level: "info",
          message: safeLine,
          metadata: { stream: "stdout" },
        });
      };

      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdoutBuffer += chunk.toString();
        const parts = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = parts.pop() ?? "";
        for (const line of parts) {
          processStdoutLine(line);
        }
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        const lines = chunk
          .toString()
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0);
        for (const line of lines) {
          const safeLine = redactSecrets(line);
          if (stderrSnippet.length < 600) {
            stderrSnippet = stderrSnippet ? `${stderrSnippet} | ${safeLine}` : safeLine;
          }
          if (AUTH_ERROR_REGEX.test(line)) {
            detectedAuthError = safeLine;
          }
          enqueueEmit({
            timestamp: new Date().toISOString(),
            type: "stderr",
            stage: "Executing Google Antigravity CLI",
            level: AUTH_ERROR_REGEX.test(line) ? "error" : "warn",
            message: safeLine,
            metadata: { stream: "stderr" },
          });
        }
      });

      child.on("error", (err) => {
        const safeErr = redactSecrets(err.message);
        enqueueEmit({
          timestamp: new Date().toISOString(),
          type: "antigravity.process_error",
          stage: "Executing Google Antigravity CLI",
          level: "error",
          message: `Antigravity CLI process error: ${safeErr}`,
        });
        eventQueue.finally(() =>
          finish({
            status: "failed",
            errorMessage: `Antigravity CLI process error: ${safeErr}`,
            exitCode: 1,
            failedStage: "Executing Google Antigravity CLI",
          })
        );
      });

      child.on("close", (code, signal) => {
        if (stdoutBuffer.trim().length > 0) {
          processStdoutLine(stdoutBuffer);
          stdoutBuffer = "";
        }
        if (agentResponseBuffer.trim().length > 0) {
          flushAgentResponseBuffer();
        }

        const wasCancelled = this.cancelledRuns.has(input.runId);
        eventQueue.finally(() => {
          if (wasCancelled) {
            finish({
              status: "cancelled",
              summary: "Google Antigravity CLI execution was cancelled by user.",
              exitCode: code ?? 130,
            });
            return;
          }

          if (timedOut) {
            finish({
              status: "timed_out",
              errorMessage: `Google Antigravity CLI timed out after ${timeoutMs}ms.`,
              exitCode: code ?? 124,
              failedStage: "Executing Google Antigravity CLI",
            });
            return;
          }

          if (detectedAuthError) {
            finish({
              status: "failed",
              errorMessage: `Google Antigravity CLI authentication failed: ${detectedAuthError}`,
              exitCode: code && code !== 0 ? code : 1,
              failedStage: "Authenticating with Google Antigravity",
            });
            return;
          }

          if (detectedStreamError) {
            finish({
              status: "failed",
              errorMessage: detectedStreamError,
              exitCode: code && code !== 0 ? code : 1,
              failedStage: "Executing Google Antigravity CLI",
            });
            return;
          }

          if (code === 0) {
            finish({
              status: "completed",
              summary:
                lastResultSummary ||
                `Google Antigravity CLI completed execution in '${resolvedCwd}' with exit code 0.`,
              exitCode: 0,
            });
            return;
          }

          const terminationDetail = signal
            ? `terminated unexpectedly by signal ${signal}`
            : `exited with non-zero code ${code ?? 1}`;
          finish({
            status: "failed",
            errorMessage: stderrSnippet
              ? `Google Antigravity CLI ${terminationDetail}: ${stderrSnippet}`
              : `Google Antigravity CLI ${terminationDetail}.`,
            exitCode: code ?? 1,
            failedStage: "Executing Google Antigravity CLI",
          });
        });
      });
    });
  }

  async cancel(runId: string): Promise<void> {
    this.cancelledRuns.add(runId);
    const child = this.activeProcesses.get(runId);
    if (child) {
      try {
        child.kill();
      } catch {
        // Ignore kill error
      }
      this.activeProcesses.delete(runId);
    }
  }
}
