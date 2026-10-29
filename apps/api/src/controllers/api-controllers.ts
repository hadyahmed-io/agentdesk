import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { providerRegistry } from "../agents/registry/provider-registry.js";
import {
  removeDemonstrationData,
  seedDemonstrationData,
} from "../database/seed/seed-service.js";
import { AppError, validateBody, validateQuery } from "../middleware/error-handler.js";
import { activityRepository } from "../repositories/activity-repository.js";
import { projectRepository } from "../repositories/project-repository.js";
import { providerRepository } from "../repositories/provider-repository.js";
import { runRepository } from "../repositories/run-repository.js";
import { settingsRepository } from "../repositories/settings-repository.js";
import { taskRepository } from "../repositories/task-repository.js";
import { runService } from "../services/run-service.js";
import { validateWorkspacePath } from "../utils/security.js";
import {
  createProjectSchema,
  createProviderSchema,
  createRunSchema,
  createTaskSchema,
  projectQuerySchema,
  retryRunSchema,
  runLogsQuerySchema,
  runQuerySchema,
  taskQuerySchema,
  TERMINAL_RUN_STATUSES,
  updateProjectSchema,
  updateProviderSchema,
  updateSettingsSchema,
  updateTaskSchema,
} from "../validators/schemas.js";

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const healthController = {
  getHealth: asyncHandler((_req, res) => {
    const providers = providerRepository.list();
    const verifiedLocalCount = providers.filter(
      (p) => p.kind === "local_cli" && p.enabled && p.isVerified
    ).length;

    res.json({
      status: "ok",
      service: "agentdesk-api",
      timestamp: new Date().toISOString(),
      executionModeSummary: {
        demoAvailable: true,
        verifiedLocalProviders: verifiedLocalCount,
        mode: verifiedLocalCount > 0 ? "local_and_demo" : "demo_only",
      },
    });
  }),

  getMetrics: asyncHandler((req, res) => {
    const query = validateQuery(
      z.object({
        projectId: z.string().trim().optional(),
        providerId: z.string().trim().optional(),
        days: z.coerce.number().int().min(1).max(365).optional(),
      }),
      req.query
    );
    const metrics = runRepository.getMetrics(query);
    res.json({ data: metrics });
  }),

  globalSearch: asyncHandler((req, res) => {
    const { q } = validateQuery(
      z.object({
        q: z.string().trim().optional().default(""),
      }),
      req.query
    );

    if (!q) {
      res.json({
        data: {
          projects: [],
          tasks: [],
          runs: [],
        },
      });
      return;
    }

    const projects = projectRepository.list({
      search: q,
      archived: "all",
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: 1,
      limit: 8,
    }).items;

    const tasks = taskRepository.list({
      search: q,
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: 1,
      limit: 8,
    }).items;

    const runs = runRepository.list({
      search: q,
      sortOrder: "desc",
      page: 1,
      limit: 8,
    }).items;

    res.json({
      data: {
        projects,
        tasks,
        runs,
      },
    });
  }),

  seedDemoData: asyncHandler((_req, res) => {
    const summary = seedDemonstrationData();
    res.status(summary.alreadySeeded ? 200 : 201).json({
      data: summary,
    });
  }),

  clearDemoData: asyncHandler((_req, res) => {
    const summary = removeDemonstrationData();
    res.json({
      data: summary,
    });
  }),
};

export const projectController = {
  list: asyncHandler((req, res) => {
    const query = validateQuery(projectQuerySchema, req.query);
    const result = projectRepository.list(query);
    res.json({
      data: result.items,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  }),

  getById: asyncHandler((req, res) => {
    const project = projectRepository.findById(String(req.params.projectId));
    if (!project) {
      throw new AppError(404, "NOT_FOUND", `Project '${req.params.projectId}' was not found.`);
    }
    res.json({ data: project });
  }),

  create: asyncHandler((req, res) => {
    const body = validateBody(createProjectSchema, req.body);
    const created = projectRepository.create(body);
    res.status(201).json({ data: created });
  }),

  update: asyncHandler((req, res) => {
    const body = validateBody(updateProjectSchema, req.body);
    const updated = projectRepository.update(String(req.params.projectId), body);
    if (!updated) {
      throw new AppError(404, "NOT_FOUND", `Project '${req.params.projectId}' was not found.`);
    }
    res.json({ data: updated });
  }),

  delete: asyncHandler((req, res) => {
    const result = projectRepository.delete(String(req.params.projectId));
    if (!result.deleted) {
      throw new AppError(404, "NOT_FOUND", `Project '${req.params.projectId}' was not found.`);
    }
    res.json({ data: result });
  }),
};

export const taskController = {
  list: asyncHandler((req, res) => {
    const query = validateQuery(taskQuerySchema, req.query);
    const result = taskRepository.list(query);
    res.json({
      data: result.items,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  }),

  getById: asyncHandler((req, res) => {
    const task = taskRepository.findById(String(req.params.taskId));
    if (!task) {
      throw new AppError(404, "NOT_FOUND", `Task '${req.params.taskId}' was not found.`);
    }
    res.json({ data: task });
  }),

  create: asyncHandler((req, res) => {
    const body = validateBody(createTaskSchema, req.body);
    const project = projectRepository.findById(body.projectId);
    if (!project) {
      throw new AppError(404, "NOT_FOUND", `Project '${body.projectId}' was not found.`);
    }
    const created = taskRepository.create(body);
    res.status(201).json({ data: created });
  }),

  update: asyncHandler((req, res) => {
    const body = validateBody(updateTaskSchema, req.body);
    if (body.projectId) {
      const project = projectRepository.findById(body.projectId);
      if (!project) {
        throw new AppError(404, "NOT_FOUND", `Project '${body.projectId}' was not found.`);
      }
    }
    const updated = taskRepository.update(String(req.params.taskId), body);
    if (!updated) {
      throw new AppError(404, "NOT_FOUND", `Task '${req.params.taskId}' was not found.`);
    }
    res.json({ data: updated });
  }),

  delete: asyncHandler((req, res) => {
    const deleted = taskRepository.delete(String(req.params.taskId));
    if (!deleted) {
      throw new AppError(404, "NOT_FOUND", `Task '${req.params.taskId}' was not found.`);
    }
    res.json({ data: { deleted: true } });
  }),
};

export const providerController = {
  list: asyncHandler((_req, res) => {
    const providers = providerRepository.list();
    res.json({ data: providers });
  }),

  getById: asyncHandler((req, res) => {
    const provider = providerRepository.findById(String(req.params.providerId));
    if (!provider) {
      throw new AppError(
        404,
        "NOT_FOUND",
        `Provider '${req.params.providerId}' was not found.`
      );
    }
    res.json({ data: provider });
  }),

  create: asyncHandler((req, res) => {
    const body = validateBody(createProviderSchema, req.body);
    if (providerRepository.findById(body.id)) {
      throw new AppError(409, "CONFLICT", `Provider '${body.id}' already exists.`);
    }
    const created = providerRepository.create(body);
    res.status(201).json({ data: created });
  }),

  update: asyncHandler((req, res) => {
    const body = validateBody(updateProviderSchema, req.body);
    const updated = providerRepository.update(String(req.params.providerId), body);
    if (!updated) {
      throw new AppError(
        404,
        "NOT_FOUND",
        `Provider '${req.params.providerId}' was not found.`
      );
    }
    res.json({ data: updated });
  }),

  testProvider: asyncHandler(async (req, res) => {
    const result = await providerRegistry.verifyProvider(String(req.params.providerId));
    res.json({
      data: result,
    });
  }),
};

export const runController = {
  list: asyncHandler((req, res) => {
    const query = validateQuery(runQuerySchema, req.query);
    const result = runRepository.list(query);
    res.json({
      data: result.items,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  }),

  getById: asyncHandler((req, res) => {
    const run = runRepository.findById(String(req.params.runId));
    if (!run) {
      throw new AppError(404, "NOT_FOUND", `Agent run '${req.params.runId}' was not found.`);
    }
    res.json({ data: run });
  }),

  create: asyncHandler(async (req, res) => {
    const body = validateBody(createRunSchema, req.body);
    const created = await runService.startRun(body);
    res.status(201).json({ data: created });
  }),

  cancel: asyncHandler(async (req, res) => {
    const body = validateBody(
      z.object({
        reason: z.string().trim().max(300).optional(),
      }),
      req.body ?? {}
    );
    const cancelled = await runService.cancelRun(
      String(req.params.runId),
      body.reason || "Cancelled by user request."
    );
    res.json({ data: cancelled });
  }),

  retry: asyncHandler(async (req, res) => {
    const body = validateBody(retryRunSchema, req.body ?? {});
    const retried = await runService.retryRun(String(req.params.runId), body);
    res.status(201).json({ data: retried });
  }),

  getLogs: asyncHandler((req, res) => {
    const runId = String(req.params.runId);
    const run = runRepository.findById(runId);
    if (!run) {
      throw new AppError(404, "NOT_FOUND", `Agent run '${runId}' was not found.`);
    }
    const query = validateQuery(runLogsQuerySchema, req.query);
    const logs = runRepository.listLogs(runId, query);
    res.json({
      data: logs.items,
      pagination: {
        total: logs.total,
        page: logs.page,
        limit: logs.limit,
        totalPages: logs.totalPages,
      },
    });
  }),

  exportRun: asyncHandler((req, res) => {
    const runId = String(req.params.runId);
    const run = runRepository.findById(runId);
    if (!run) {
      throw new AppError(404, "NOT_FOUND", `Agent run '${runId}' was not found.`);
    }
    const { format } = validateQuery(
      z.object({
        format: z.enum(["json", "txt"]).optional().default("json"),
      }),
      req.query
    );

    const logs = runRepository.listLogs(runId, { page: 1, limit: 500 }).items;

    if (format === "txt") {
      const lines = [
        `AgentDesk Run Export — ${run.id}`,
        `Project: ${run.projectName} (${run.projectId})`,
        `Task: ${run.taskTitle} (${run.taskId})`,
        `Provider: ${run.providerName} (${run.providerId}) [${
          run.isSimulated ? "SIMULATED DEMO" : "LOCAL CLI"
        }]`,
        `Status: ${run.status}`,
        `Started: ${run.startedAt ?? "N/A"}`,
        `Ended: ${run.endedAt ?? "N/A"}`,
        `Duration: ${run.durationMs !== null ? `${run.durationMs}ms` : "N/A"}`,
        `Exit Code: ${run.exitCode ?? "N/A"}`,
        `Summary: ${run.summary ?? run.errorMessage ?? "N/A"}`,
        "",
        "--- Execution Logs ---",
        ...logs.map(
          (l) =>
            `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.eventType}] ${l.message}`
        ),
      ];
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="agentdesk-${run.id}.txt"`
      );
      res.send(lines.join("\n"));
      return;
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="agentdesk-${run.id}.json"`
    );
    res.json({
      exportedAt: new Date().toISOString(),
      run,
      logs,
    });
  }),

  streamEvents: (req: Request, res: Response, next: NextFunction) => {
    try {
      const runId = String(req.params.runId);
      const run = runRepository.findById(runId);
      if (!run) {
        throw new AppError(404, "NOT_FOUND", `Agent run '${runId}' was not found.`);
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const writeEvent = (event: string, payload: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
      };

      writeEvent("snapshot", { run });

      if (TERMINAL_RUN_STATUSES.has(run.status)) {
        res.end();
        return;
      }

      const unsubscribe = runService.subscribe(runId, (msg) => {
        writeEvent(msg.type, msg);
        if (msg.run && TERMINAL_RUN_STATUSES.has(msg.run.status)) {
          unsubscribe();
          res.end();
        }
      });

      const keepAliveTimer = setInterval(() => {
        res.write(": keep-alive\n\n");
      }, 15000);

      req.on("close", () => {
        clearInterval(keepAliveTimer);
        unsubscribe();
      });
    } catch (err) {
      next(err);
    }
  },
};

export const settingsController = {
  getSettings: asyncHandler((_req, res) => {
    const settings = settingsRepository.getAll();
    const workspaceCheck = validateWorkspacePath(
      settings.approvedWorkspaceRoot,
      settings.approvedWorkspaceRoot,
      true
    );
    res.json({
      data: {
        settings,
        workspaceStatus: workspaceCheck,
      },
    });
  }),

  updateSettings: asyncHandler((req, res) => {
    const body = validateBody(updateSettingsSchema, req.body);
    const updated = settingsRepository.update(body);
    activityRepository.record({
      eventType: "settings.updated",
      entityType: "settings",
      entityId: "app_settings",
      title: "Application settings updated",
      description: `Updated keys: ${Object.keys(body).join(", ")}`,
    });
    const workspaceCheck = validateWorkspacePath(
      updated.approvedWorkspaceRoot,
      updated.approvedWorkspaceRoot,
      true
    );
    res.json({
      data: {
        settings: updated,
        workspaceStatus: workspaceCheck,
      },
    });
  }),

  validateWorkspace: asyncHandler((req, res) => {
    const { candidatePath } = validateBody(
      z.object({
        candidatePath: z.string({ required_error: "Path is required." }).trim().min(1),
      }),
      req.body
    );
    const settings = settingsRepository.getAll();
    const result = validateWorkspacePath(
      candidatePath,
      settings.approvedWorkspaceRoot,
      true
    );
    res.json({ data: result });
  }),

  exportMetadata: asyncHandler((_req, res) => {
    const projects = projectRepository.list({
      archived: "all",
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: 1,
      limit: 100,
    }).items;
    const tasks = taskRepository.list({
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: 1,
      limit: 100,
    }).items;
    const runs = runRepository.list({
      sortOrder: "desc",
      page: 1,
      limit: 100,
    }).items;
    const providers = providerRepository.list();
    const settings = settingsRepository.getAll();

    res.json({
      data: {
        exportedAt: new Date().toISOString(),
        version: "1.0.0",
        settings,
        providers,
        projects,
        tasks,
        runs,
      },
    });
  }),
};

export const activityController = {
  list: asyncHandler((req, res) => {
    const query = validateQuery(
      z.object({
        projectId: z.string().trim().optional(),
        entityId: z.string().trim().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional().default(40),
      }),
      req.query
    );
    const items = activityRepository.list(query);
    res.json({ data: items });
  }),
};
