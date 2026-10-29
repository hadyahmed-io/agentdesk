import { spawn, type ChildProcess } from "node:child_process";
import { redactSecrets, validateWorkspacePath } from "../../utils/security.js";
import type {
  AgentEvent,
  AgentProvider,
  AgentRunInput,
  AgentRunResult,
  ProviderValidationResult,
} from "../interfaces/provider.js";

function checkBinaryVersion(
  executable: string,
  args: string[] = ["--version"],
  timeoutMs = 5000
): Promise<{ ok: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (res: { ok: boolean; output: string; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };

    let child: ChildProcess;
    try {
      child = spawn(executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      finish({
        ok: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Ignore kill error
      }
      finish({
        ok: false,
        output: stdout.trim(),
        error: `Timed out after ${timeoutMs}ms waiting for '${executable}'.`,
      });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      finish({
        ok: false,
        output: stdout.trim(),
        error: err.message,
      });
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish({
          ok: true,
          output: (stdout || stderr).trim(),
        });
      } else {
        finish({
          ok: false,
          output: (stdout || stderr).trim(),
          error: `Process '${executable}' exited with code ${code}: ${(stderr || stdout).trim()}`,
        });
      }
    });
  });
}

const READONLY_INSPECTOR_SCRIPT = `
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const targetDir = process.argv[1];
const taskTitle = process.argv[2] || "Workspace Inspection";

console.log("[LOCAL-CLI] Starting read-only repository inspection in: " + targetDir);
console.log("[LOCAL-CLI] Task context: " + taskTitle);

const entries = fs.readdirSync(targetDir, { withFileTypes: true });
const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules").map((e) => e.name);
const files = entries.filter((e) => e.isFile()).map((e) => e.name);

console.log("[LOCAL-CLI] Top-level directories (" + dirs.length + "): " + (dirs.join(", ") || "none"));
console.log("[LOCAL-CLI] Top-level files (" + files.length + "): " + (files.join(", ") || "none"));

const pkgPath = path.join(targetDir, "package.json");
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const scripts = Object.keys(pkg.scripts || {});
    console.log("[LOCAL-CLI] Detected package.json name='" + (pkg.name || "unnamed") + "', scripts=[" + scripts.join(", ") + "]");
  } catch (e) {
    console.error("[LOCAL-CLI] Warning: Failed to parse package.json: " + e.message);
  }
}

const gitDir = path.join(targetDir, ".git");
if (fs.existsSync(gitDir)) {
  try {
    const gitStatus = execFileSync("git", ["status", "--short", "--branch"], {
      cwd: targetDir,
      encoding: "utf8",
      timeout: 5000
    });
    console.log("[LOCAL-CLI] Git status summary:\\n" + gitStatus.trim());
  } catch (e) {
    console.error("[LOCAL-CLI] Warning: git status check failed: " + e.message);
  }
} else {
  console.log("[LOCAL-CLI] No .git directory found at workspace root.");
}

console.log("[LOCAL-CLI] Read-only workspace inspection completed successfully.");
`;

export class LocalWorkspaceCliProvider implements AgentProvider {
  readonly id = "local-workspace-cli";
  readonly name = "Local Workspace Verifier (Node + Git CLI)";
  readonly kind = "local_cli" as const;

  private activeProcesses = new Map<string, ChildProcess>();
  private cancelledRuns = new Set<string>();

  async validateConfiguration(): Promise<ProviderValidationResult> {
    const nodeCheck = await checkBinaryVersion(process.execPath, ["--version"]);
    if (!nodeCheck.ok) {
      return {
        valid: false,
        message: `Node.js runtime verification failed: ${nodeCheck.error ?? "Unknown error"}`,
      };
    }

    const gitCheck = await checkBinaryVersion("git", ["--version"]);
    if (!gitCheck.ok) {
      return {
        valid: false,
        message: `Git CLI verification failed: ${gitCheck.error ?? "git executable not found on PATH"}`,
      };
    }

    return {
      valid: true,
      message: `Verified local CLI binaries: Node (${nodeCheck.output}) and ${gitCheck.output}. Ready for read-only workspace inspection.`,
      details: {
        nodeVersion: nodeCheck.output,
        gitVersion: gitCheck.output,
        readOnly: true,
      },
    };
  }

  async execute(
    input: AgentRunInput,
    emit: (event: AgentEvent) => Promise<void>
  ): Promise<AgentRunResult> {
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
        type: "local_cli.workspace_error",
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

    const resolvedCwd = pathValidation.resolvedPath;
    const timeoutMs = Math.min(
      Math.max(Number(input.timeoutMs ?? input.providerConfig?.timeoutMs ?? 30000), 1000),
      300000
    );

    await emit({
      timestamp: new Date().toISOString(),
      type: "local_cli.spawn",
      stage: "Spawning Local CLI Process",
      level: "info",
      message: `Spawning read-only Node/Git workspace inspector in verified directory '${resolvedCwd}'.`,
      metadata: {
        executable: "node",
        cwd: resolvedCwd,
        readOnly: true,
        timeoutMs,
      },
    });

    return new Promise<AgentRunResult>((resolve) => {
      let settled = false;
      let timedOut = false;

      const child = spawn(
        process.execPath,
        ["-e", READONLY_INSPECTOR_SCRIPT, resolvedCwd, input.taskTitle],
        {
          cwd: resolvedCwd,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

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

      child.stdout?.on("data", (chunk: Buffer) => {
        const lines = chunk
          .toString("utf8")
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0);
        for (const line of lines) {
          enqueueEmit({
            timestamp: new Date().toISOString(),
            type: "stdout",
            stage: "Executing Local Workspace Inspector",
            level: "info",
            message: redactSecrets(line),
            metadata: { stream: "stdout" },
          });
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const lines = chunk
          .toString("utf8")
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0);
        for (const line of lines) {
          enqueueEmit({
            timestamp: new Date().toISOString(),
            type: "stderr",
            stage: "Executing Local Workspace Inspector",
            level: "warn",
            message: redactSecrets(line),
            metadata: { stream: "stderr" },
          });
        }
      });

      child.on("error", (err) => {
        enqueueEmit({
          timestamp: new Date().toISOString(),
          type: "local_cli.error",
          stage: "Executing Local Workspace Inspector",
          level: "error",
          message: `Process error: ${redactSecrets(err.message)}`,
        });
        eventQueue.finally(() =>
          finish({
            status: "failed",
            errorMessage: redactSecrets(err.message),
            exitCode: 1,
            failedStage: "Executing Local Workspace Inspector",
          })
        );
      });

      child.on("close", (code) => {
        const wasCancelled = this.cancelledRuns.has(input.runId);
        eventQueue.finally(() => {
          if (wasCancelled) {
            finish({
              status: "cancelled",
              summary: "Local CLI inspection process was terminated by user cancellation.",
              exitCode: code ?? 130,
            });
          } else if (timedOut) {
            finish({
              status: "timed_out",
              errorMessage: `Local CLI process timed out after ${timeoutMs}ms.`,
              exitCode: code ?? 124,
              failedStage: "Executing Local Workspace Inspector",
            });
          } else if (code === 0) {
            finish({
              status: "completed",
              summary: `Completed real local CLI workspace inspection in '${resolvedCwd}' with exit code 0.`,
              exitCode: 0,
            });
          } else {
            finish({
              status: "failed",
              errorMessage: `Local CLI process exited with non-zero code ${code ?? 1}.`,
              exitCode: code ?? 1,
              failedStage: "Executing Local Workspace Inspector",
            });
          }
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
        // Ignore error
      }
      this.activeProcesses.delete(runId);
    }
  }
}

export class ClaudeCodeCliProvider implements AgentProvider {
  readonly id = "claude-code-cli";
  readonly name = "Claude Code CLI Adapter";
  readonly kind = "local_cli" as const;

  private activeProcesses = new Map<string, ChildProcess>();
  private cancelledRuns = new Set<string>();

  async validateConfiguration(): Promise<ProviderValidationResult> {
    const check = await checkBinaryVersion("claude", ["--version"], 5000);
    if (!check.ok) {
      return {
        valid: false,
        message:
          "Executable 'claude' was not found on system PATH. Install '@anthropic-ai/claude-code' globally and authenticate to enable live Claude Code CLI runs.",
        details: {
          executable: "claude",
          error: check.error ?? "Binary not found on PATH",
        },
      };
    }

    return {
      valid: true,
      message: `Verified Claude Code CLI: ${check.output}`,
      details: {
        executable: "claude",
        version: check.output,
      },
    };
  }

  async execute(
    input: AgentRunInput,
    emit: (event: AgentEvent) => Promise<void>
  ): Promise<AgentRunResult> {
    const verification = await this.validateConfiguration();
    if (!verification.valid) {
      await emit({
        timestamp: new Date().toISOString(),
        type: "local_cli.missing_binary",
        stage: "Verifying CLI Prerequisite",
        level: "error",
        message: verification.message,
      });
      return {
        status: "failed",
        errorMessage: verification.message,
        exitCode: 127,
        failedStage: "Verifying CLI Prerequisite",
      };
    }

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
        type: "local_cli.workspace_error",
        stage: "Validating Workspace Path",
        level: "error",
        message: reason,
      });
      return {
        status: "failed",
        errorMessage: reason,
        exitCode: 1,
        failedStage: "Validating Workspace Path",
      };
    }

    const resolvedCwd = pathValidation.resolvedPath;
    const timeoutMs = Math.min(
      Math.max(Number(input.timeoutMs ?? input.providerConfig?.timeoutMs ?? 120000), 1000),
      600000
    );

    return new Promise<AgentRunResult>((resolve) => {
      let settled = false;
      let timedOut = false;

      const child = spawn("claude", ["--print", input.instructions], {
        cwd: resolvedCwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.activeProcesses.set(input.runId, child);

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          // Ignore
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

      child.stdout?.on("data", (chunk: Buffer) => {
        const lines = chunk
          .toString("utf8")
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0);
        for (const line of lines) {
          enqueueEmit({
            timestamp: new Date().toISOString(),
            type: "stdout",
            stage: "Executing Claude Code CLI",
            level: "info",
            message: redactSecrets(line),
            metadata: { stream: "stdout" },
          });
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const lines = chunk
          .toString("utf8")
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0);
        for (const line of lines) {
          enqueueEmit({
            timestamp: new Date().toISOString(),
            type: "stderr",
            stage: "Executing Claude Code CLI",
            level: "warn",
            message: redactSecrets(line),
            metadata: { stream: "stderr" },
          });
        }
      });

      child.on("error", (err) => {
        eventQueue.finally(() =>
          finish({
            status: "failed",
            errorMessage: redactSecrets(err.message),
            exitCode: 1,
            failedStage: "Executing Claude Code CLI",
          })
        );
      });

      child.on("close", (code) => {
        const wasCancelled = this.cancelledRuns.has(input.runId);
        eventQueue.finally(() => {
          if (wasCancelled) {
            finish({
              status: "cancelled",
              summary: "Claude Code CLI execution cancelled by user.",
              exitCode: code ?? 130,
            });
          } else if (timedOut) {
            finish({
              status: "timed_out",
              errorMessage: `Claude Code CLI timed out after ${timeoutMs}ms.`,
              exitCode: code ?? 124,
              failedStage: "Executing Claude Code CLI",
            });
          } else if (code === 0) {
            finish({
              status: "completed",
              summary: "Claude Code CLI execution completed with exit code 0.",
              exitCode: 0,
            });
          } else {
            finish({
              status: "failed",
              errorMessage: `Claude Code CLI exited with code ${code ?? 1}.`,
              exitCode: code ?? 1,
              failedStage: "Executing Claude Code CLI",
            });
          }
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
        // Ignore
      }
      this.activeProcesses.delete(runId);
    }
  }
}
