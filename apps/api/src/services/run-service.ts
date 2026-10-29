import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { providerRegistry } from "../agents/registry/provider-registry.js";
import { AppError } from "../middleware/error-handler.js";
import { projectRepository } from "../repositories/project-repository.js";
import {
  runRepository,
  type AgentRunRecord,
  type RunLogRecord,
} from "../repositories/run-repository.js";
import { settingsRepository } from "../repositories/settings-repository.js";
import { taskRepository } from "../repositories/task-repository.js";
import { logger } from "../utils/logger.js";
import {
  resolveProjectWorkspaceDirectory,
  validateWorkspacePath,
} from "../utils/security.js";
import {
  ACTIVE_RUN_STATUSES,
  TERMINAL_RUN_STATUSES,
  type createRunSchema,
  type retryRunSchema,
} from "../validators/schemas.js";

export interface RunStreamMessage {
  type: "run_updated" | "log_appended";
  run?: AgentRunRecord;
  log?: RunLogRecord;
}

export class RunService {
  private emitter = new EventEmitter();
  private cancelledRunIds = new Set<string>();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  subscribe(runId: string, listener: (msg: RunStreamMessage) => void): () => void {
    const channel = `run:${runId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }

  private broadcast(runId: string, msg: RunStreamMessage): void {
    this.emitter.emit(`run:${runId}`, msg);
  }

  async startRun(
    input: z.infer<typeof createRunSchema>,
    retryOfRunId?: string | null
  ): Promise<AgentRunRecord> {
    const task = taskRepository.findById(input.taskId);
    if (!task) {
      throw new AppError(404, "NOT_FOUND", `Task '${input.taskId}' was not found.`);
    }

    if (input.projectId && input.projectId !== task.projectId) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Task '${task.id}' belongs to project '${task.projectId}', not '${input.projectId}'.`,
        [{ field: "projectId", message: "Project ID does not match the task's project." }]
      );
    }

    const project = projectRepository.findById(task.projectId);
    if (!project) {
      throw new AppError(404, "NOT_FOUND", `Project '${task.projectId}' was not found.`);
    }

    const { record: providerRecord, adapter } = providerRegistry.getExecutableProvider(
      input.providerId
    );

    const settings = settingsRepository.getAll();
    const effectiveMode =
      providerRecord.kind === "demo"
        ? "demo"
        : input.executionMode ?? "local";

    if (providerRecord.kind === "demo" && input.executionMode === "local") {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Simulated demo provider cannot run in 'local' real execution mode.",
        [{ field: "executionMode", message: "Demo provider only supports 'demo' execution mode." }]
      );
    }

    let workingDir =
      input.workingDirectoryOverride?.trim() || project.localPath?.trim() || "";

    if (effectiveMode === "local") {
      if (!workingDir) {
        workingDir = resolveProjectWorkspaceDirectory(
          project.name,
          project.id,
          settings.approvedWorkspaceRoot,
          true
        );
        projectRepository.update(project.id, { localPath: workingDir });
      } else {
        const defaultWsRoot = path.resolve(settings.approvedWorkspaceRoot, "workspaces");
        const resolvedCandidate = path.resolve(workingDir);
        const normRoot =
          process.platform === "win32" ? defaultWsRoot.toLowerCase() : defaultWsRoot;
        const normCandidate =
          process.platform === "win32"
            ? resolvedCandidate.toLowerCase()
            : resolvedCandidate;
        if (
          normCandidate.startsWith(normRoot + path.sep) &&
          !fs.existsSync(resolvedCandidate)
        ) {
          fs.mkdirSync(resolvedCandidate, { recursive: true });
        }
      }

      const pathCheck = validateWorkspacePath(
        workingDir,
        settings.approvedWorkspaceRoot,
        true
      );
      if (!pathCheck.valid) {
        throw new AppError(
          403,
          "FORBIDDEN_WORKSPACE",
          pathCheck.reason ?? "Workspace directory failed validation."
        );
      }
    } else if (!workingDir) {
      workingDir = settings.approvedWorkspaceRoot;
    }

    const rawInstructions =
      input.instructionsOverride?.trim() ||
      task.agentInstructions?.trim() ||
      project.agentInstructions?.trim() ||
      `Task: ${task.title}\n${task.description ? `Description: ${task.description}` : "Execute this task directly in the project workspace directory."}`;
    const instructionsSnapshot = rawInstructions.replace(
      "Description: Complete the task according to acceptance criteria.",
      "Execute this task directly in the project workspace directory."
    );

    const configSnapshot: Record<string, unknown> = {
      providerKind: providerRecord.kind,
      isSimulated: providerRecord.kind === "demo",
      workingDirectory: effectiveMode === "local" ? workingDir : project.localPath ?? "(virtual)",
      allowFileEdits: Boolean(input.allowFileEdits),
      simulatedOutcome: input.simulatedOutcome ?? providerRecord.config.simulatedOutcome ?? "completed",
      stepDelayMs: input.stepDelayMs ?? providerRecord.config.stepDelayMs ?? 600,
    };

    const createdRun = runRepository.create({
      projectId: project.id,
      projectName: project.name,
      taskId: task.id,
      taskTitle: task.title,
      providerId: providerRecord.id,
      providerName: providerRecord.name,
      executionMode: effectiveMode,
      instructionsSnapshot,
      retryOfRunId: retryOfRunId ?? null,
      configSnapshot,
    });

    const initialLog = runRepository.appendLog({
      runId: createdRun.id,
      level: "info",
      eventType: "run.queued",
      message:
        providerRecord.kind === "demo"
          ? `[SIMULATED DEMO] Queued run ${createdRun.id} for task "${task.title}" using ${providerRecord.name}.`
          : `Queued local CLI run ${createdRun.id} for task "${task.title}" using ${providerRecord.name}.`,
      metadata: {
        providerId: providerRecord.id,
        executionMode: effectiveMode,
        simulated: providerRecord.kind === "demo",
        retryOfRunId: retryOfRunId ?? undefined,
      },
    });
    this.broadcast(createdRun.id, { type: "log_appended", log: initialLog });

    if (task.status === "backlog" || task.status === "todo") {
      taskRepository.update(task.id, { status: "in_progress" });
    }

    const providerTimeoutMs = Number(providerRecord.config.timeoutMs ?? 0);
    const effectiveTimeoutMs =
      effectiveMode === "local"
        ? Math.max(settings.executionTimeoutMs, providerTimeoutMs, 240000)
        : settings.executionTimeoutMs;

    // Fire-and-forget async lifecycle execution
    void this.executeRunLifecycle(createdRun.id, {
      runId: createdRun.id,
      projectId: project.id,
      projectName: project.name,
      taskId: task.id,
      taskTitle: task.title,
      instructions: instructionsSnapshot,
      acceptanceCriteria: task.acceptanceCriteria,
      workingDirectory: workingDir,
      approvedWorkspaceRoot: settings.approvedWorkspaceRoot,
      executionMode: effectiveMode,
      allowFileEdits: input.allowFileEdits,
      timeoutMs: effectiveTimeoutMs,
      simulatedOutcome: input.simulatedOutcome,
      stepDelayMs: input.stepDelayMs,
      providerConfig: providerRecord.config,
    }, adapter);

    return runRepository.findById(createdRun.id)!;
  }

  private async executeRunLifecycle(
    runId: string,
    input: Parameters<typeof providerRegistry.getAdapter>[0] extends never
      ? never
      : Parameters<ReturnType<typeof providerRegistry.getAdapter>["execute"]>[0],
    adapter: ReturnType<typeof providerRegistry.getAdapter>
  ): Promise<void> {
    try {
      if (this.cancelledRunIds.has(runId)) {
        return;
      }

      const startingRun = runRepository.transitionStatus(runId, "starting", {
        currentStage: "Starting",
        latestMessage: "Preparing agent provider runtime...",
      });
      this.broadcast(runId, { type: "run_updated", run: startingRun });

      if (this.cancelledRunIds.has(runId)) {
        return;
      }

      const runningRun = runRepository.transitionStatus(runId, "running", {
        currentStage: "Running",
        latestMessage: "Agent execution in progress...",
      });
      this.broadcast(runId, { type: "run_updated", run: runningRun });

      const result = await adapter.execute(input, async (event) => {
        if (this.cancelledRunIds.has(runId)) {
          return;
        }
        const current = runRepository.findById(runId);
        if (!current || TERMINAL_RUN_STATUSES.has(current.status)) {
          return;
        }
        if (event.stage || event.message) {
          runRepository.updateProgress(
            runId,
            event.stage ?? current.currentStage ?? "Running",
            event.message
          );
        }
        const logRecord = runRepository.appendLog({
          runId,
          timestamp: event.timestamp,
          level: event.level ?? "info",
          eventType: event.type,
          message: event.message,
          metadata: event.metadata,
        });
        const refreshed = runRepository.findById(runId)!;
        this.broadcast(runId, { type: "log_appended", log: logRecord });
        this.broadcast(runId, { type: "run_updated", run: refreshed });
      });

      const currentAfterExec = runRepository.findById(runId);
      if (!currentAfterExec || TERMINAL_RUN_STATUSES.has(currentAfterExec.status)) {
        return;
      }

      const finalStageMap: Record<string, string> = {
        completed: "Completed",
        failed: result.failedStage ?? "Failed",
        cancelled: "Cancelled",
        timed_out: result.failedStage ?? "Timed Out",
      };

      const finalRun = runRepository.transitionStatus(runId, result.status, {
        currentStage: finalStageMap[result.status] ?? result.status,
        latestMessage:
          result.summary ??
          result.errorMessage ??
          `Execution finished with status '${result.status}'.`,
        summary: result.summary ?? null,
        errorMessage: result.errorMessage ?? null,
        exitCode: result.exitCode ?? (result.status === "completed" ? 0 : 1),
      });

      this.broadcast(runId, { type: "run_updated", run: finalRun });
    } catch (err) {
      logger.error("Unexpected failure during run execution lifecycle", {
        runId,
        error: err instanceof Error ? err.message : String(err),
      });
      const current = runRepository.findById(runId);
      if (current && !TERMINAL_RUN_STATUSES.has(current.status)) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const failedLog = runRepository.appendLog({
          runId,
          level: "error",
          eventType: "run.internal_error",
          message: `Execution terminated unexpectedly: ${errMsg}`,
        });
        const failedRun = runRepository.transitionStatus(runId, "failed", {
          currentStage: "Failed",
          latestMessage: errMsg,
          errorMessage: errMsg,
          exitCode: 1,
        });
        this.broadcast(runId, { type: "log_appended", log: failedLog });
        this.broadcast(runId, { type: "run_updated", run: failedRun });
      }
    } finally {
      this.cancelledRunIds.delete(runId);
    }
  }

  async cancelRun(runId: string, reason = "Cancelled by user request."): Promise<AgentRunRecord> {
    const existing = runRepository.findById(runId);
    if (!existing) {
      throw new AppError(404, "NOT_FOUND", `Agent run '${runId}' was not found.`);
    }

    if (!ACTIVE_RUN_STATUSES.has(existing.status)) {
      throw new AppError(
        409,
        "INVALID_STATE_TRANSITION",
        `Cannot cancel run '${runId}' because it is already in terminal state '${existing.status}'.`
      );
    }

    this.cancelledRunIds.add(runId);

    if (providerRegistry.hasAdapter(existing.providerId)) {
      const adapter = providerRegistry.getAdapter(existing.providerId);
      await adapter.cancel(runId);
    }

    const latestCheck = runRepository.findById(runId)!;
    if (TERMINAL_RUN_STATUSES.has(latestCheck.status)) {
      return latestCheck;
    }

    const cancelLog = runRepository.appendLog({
      runId,
      level: "warn",
      eventType: "run.cancelled",
      message: `Run cancelled: ${reason}`,
      metadata: {
        previousStatus: latestCheck.status,
      },
    });

    const cancelledRun = runRepository.transitionStatus(runId, "cancelled", {
      currentStage: "Cancelled",
      latestMessage: reason,
      summary: `Cancelled by user while in '${latestCheck.status}' state.`,
      cancellationReason: reason,
      exitCode: 130,
    });

    this.broadcast(runId, { type: "log_appended", log: cancelLog });
    this.broadcast(runId, { type: "run_updated", run: cancelledRun });

    return cancelledRun;
  }

  async retryRun(
    originalRunId: string,
    overrides: z.infer<typeof retryRunSchema> = {}
  ): Promise<AgentRunRecord> {
    const original = runRepository.findById(originalRunId);
    if (!original) {
      throw new AppError(404, "NOT_FOUND", `Agent run '${originalRunId}' was not found.`);
    }

    if (ACTIVE_RUN_STATUSES.has(original.status)) {
      throw new AppError(
        409,
        "CONFLICT",
        `Cannot retry run '${originalRunId}' while it is still active (${original.status}). Cancel it first or wait for completion.`
      );
    }

    const providerId = overrides.providerId ?? original.providerId;
    const executionMode = overrides.executionMode ?? original.executionMode;
    const rawInstructions =
      overrides.instructionsOverride ?? original.instructionsSnapshot;
    const instructionsOverride = rawInstructions.replace(
      "Description: Complete the task according to acceptance criteria.",
      "Execute this task directly in the project workspace directory."
    );
    const allowFileEdits = Boolean(original.configSnapshot?.allowFileEdits);

    return this.startRun(
      {
        taskId: original.taskId,
        projectId: original.projectId,
        providerId,
        executionMode,
        instructionsOverride,
        allowFileEdits,
        simulatedOutcome: overrides.simulatedOutcome,
        stepDelayMs: overrides.stepDelayMs,
      },
      original.id
    );
  }
}

export const runService = new RunService();
