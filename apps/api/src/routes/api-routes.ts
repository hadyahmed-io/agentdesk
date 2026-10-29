import { Router } from "express";
import {
  activityController,
  healthController,
  projectController,
  providerController,
  runController,
  settingsController,
  taskController,
} from "../controllers/api-controllers.js";

export const apiRouter = Router();

// Health, Metrics, Search & Seed
apiRouter.get("/health", healthController.getHealth);
apiRouter.get("/metrics", healthController.getMetrics);
apiRouter.get("/search", healthController.globalSearch);
apiRouter.post("/seed", healthController.seedDemoData);
apiRouter.delete("/seed", healthController.clearDemoData);

// Projects
apiRouter.get("/projects", projectController.list);
apiRouter.post("/projects", projectController.create);
apiRouter.get("/projects/:projectId", projectController.getById);
apiRouter.patch("/projects/:projectId", projectController.update);
apiRouter.delete("/projects/:projectId", projectController.delete);

// Tasks
apiRouter.get("/tasks", taskController.list);
apiRouter.post("/tasks", taskController.create);
apiRouter.get("/tasks/:taskId", taskController.getById);
apiRouter.patch("/tasks/:taskId", taskController.update);
apiRouter.delete("/tasks/:taskId", taskController.delete);

// Providers
apiRouter.get("/providers", providerController.list);
apiRouter.post("/providers", providerController.create);
apiRouter.get("/providers/:providerId", providerController.getById);
apiRouter.patch("/providers/:providerId", providerController.update);
apiRouter.post("/providers/:providerId/test", providerController.testProvider);

// Agent Runs
apiRouter.get("/runs", runController.list);
apiRouter.post("/runs", runController.create);
apiRouter.get("/runs/:runId", runController.getById);
apiRouter.post("/runs/:runId/cancel", runController.cancel);
apiRouter.post("/runs/:runId/retry", runController.retry);
apiRouter.get("/runs/:runId/logs", runController.getLogs);
apiRouter.get("/runs/:runId/export", runController.exportRun);
apiRouter.get("/runs/:runId/events", runController.streamEvents);

// Settings & Workspace
apiRouter.get("/settings", settingsController.getSettings);
apiRouter.patch("/settings", settingsController.updateSettings);
apiRouter.post("/settings/validate-workspace", settingsController.validateWorkspace);
apiRouter.get("/settings/export", settingsController.exportMetadata);

// Activity Feed
apiRouter.get("/activity", activityController.list);
