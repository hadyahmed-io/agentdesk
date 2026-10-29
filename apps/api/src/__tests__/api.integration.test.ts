import request from "supertest";
import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDatabase, runMigrations } from "../database/client.js";

describe("AgentDesk REST API Integration Tests", () => {
  const app = createApp();

  beforeEach(() => {
    process.env.DATABASE_URL = ":memory:";
    closeDatabase();
    runMigrations(":memory:");
  });

  afterAll(() => {
    closeDatabase();
  });

  it("1. Health check and initial empty metrics work accurately", async () => {
    const healthRes = await request(app).get("/api/health");
    expect(healthRes.status).toBe(200);
    expect(healthRes.body.status).toBe("ok");
    expect(healthRes.body.executionModeSummary.demoAvailable).toBe(true);

    const metricsRes = await request(app).get("/api/metrics");
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body.data.totalProjects).toBe(0);
    expect(metricsRes.body.data.openTasks).toBe(0);
    expect(metricsRes.body.data.totalRuns).toBe(0);
    expect(metricsRes.body.data.successRate).toBeNull();
  });

  it("2. Creates, lists, updates, filters, archives, and deletes projects", async () => {
    // Reject invalid body
    const invalidRes = await request(app).post("/api/projects").send({ name: "" });
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error.code).toBe("VALIDATION_ERROR");

    // Create project
    const createRes = await request(app).post("/api/projects").send({
      name: "Quantum Gateway",
      description: "Edge API router",
      language: "TypeScript",
      framework: "Express",
      tags: ["api", "gateway"],
      gitRepoUrl: "https://github.com/example/quantum-gateway",
    });
    expect(createRes.status).toBe(201);
    const project = createRes.body.data;
    expect(project.id).toMatch(/^proj_/);
    expect(project.name).toBe("Quantum Gateway");
    expect(project.tags).toEqual(["api", "gateway"]);

    // List projects & search
    const listRes = await request(app).get("/api/projects?search=quantum");
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.pagination.total).toBe(1);

    // Update & archive project
    const patchRes = await request(app)
      .patch(`/api/projects/${project.id}`)
      .send({ archived: true, description: "Archived router" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.archived).toBe(true);

    // Default list excludes archived
    const activeList = await request(app).get("/api/projects?archived=false");
    expect(activeList.body.data).toHaveLength(0);

    // Delete project
    const delRes = await request(app).delete(`/api/projects/${project.id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.data.deleted).toBe(true);

    // Not found after delete
    const getDeleted = await request(app).get(`/api/projects/${project.id}`);
    expect(getDeleted.status).toBe(404);
    expect(getDeleted.body.error.code).toBe("NOT_FOUND");
  });

  it("3. Creates, updates, filters, and paginates tasks linked to projects", async () => {
    const projRes = await request(app)
      .post("/api/projects")
      .send({ name: "Billing Service" });
    const projectId = projRes.body.data.id;

    const task1 = await request(app).post("/api/tasks").send({
      projectId,
      title: "Add webhook signature verification",
      priority: "urgent",
      status: "todo",
      labels: ["security", "webhooks"],
      acceptanceCriteria: [
        "Reject requests without HMAC header",
        "Verify timestamp tolerance window",
      ],
    });
    expect(task1.status).toBe(201);
    expect(task1.body.data.acceptanceCriteria).toHaveLength(2);

    const task2 = await request(app).post("/api/tasks").send({
      projectId,
      title: "Format invoice PDF footer",
      priority: "low",
      status: "backlog",
    });
    expect(task2.status).toBe(201);

    // Filter by priority
    const urgentTasks = await request(app).get(
      `/api/tasks?projectId=${projectId}&priority=urgent`
    );
    expect(urgentTasks.status).toBe(200);
    expect(urgentTasks.body.data).toHaveLength(1);
    expect(urgentTasks.body.data[0].title).toBe("Add webhook signature verification");

    // Update task status to done sets completedAt
    const updateRes = await request(app)
      .patch(`/api/tasks/${task1.body.data.id}`)
      .send({ status: "done" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.status).toBe("done");
    expect(updateRes.body.data.completedAt).toBeTruthy();
  });

  it("4. Executes a complete Demo Run lifecycle, persists logs, and retries without overwriting history", async () => {
    const projRes = await request(app)
      .post("/api/projects")
      .send({ name: "Compiler Core" });
    const projectId = projRes.body.data.id;

    const taskRes = await request(app).post("/api/tasks").send({
      projectId,
      title: "Optimize AST traversal",
      acceptanceCriteria: ["No recursive stack overflow"],
    });
    const taskId = taskRes.body.data.id;

    // Start fast demo run
    const runRes = await request(app).post("/api/runs").send({
      taskId,
      providerId: "demo-agent",
      stepDelayMs: 35,
    });
    expect(runRes.status).toBe(201);
    const runId = runRes.body.data.id;

    // Poll until completed
    let finalRun = runRes.body.data;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 40));
      const check = await request(app).get(`/api/runs/${runId}`);
      finalRun = check.body.data;
      if (finalRun.status === "completed" || finalRun.status === "failed") {
        break;
      }
    }

    expect(finalRun.status).toBe("completed");
    expect(finalRun.exitCode).toBe(0);
    expect(finalRun.isSimulated).toBe(true);
    expect(finalRun.durationMs).toBeGreaterThanOrEqual(0);

    // Retrieve persisted logs
    const logsRes = await request(app).get(`/api/runs/${runId}/logs`);
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.data.length).toBeGreaterThanOrEqual(5);
    expect(logsRes.body.data[0].message).toContain("[SIMULATED DEMO]");

    // Retry finished run creates a NEW run ID and preserves original run
    const retryRes = await request(app)
      .post(`/api/runs/${runId}/retry`)
      .send({ stepDelayMs: 35, simulatedOutcome: "failed" });
    expect(retryRes.status).toBe(201);
    const retryRunId = retryRes.body.data.id;
    expect(retryRunId).not.toBe(runId);
    expect(retryRes.body.data.retryOfRunId).toBe(runId);

    // Wait for retry run to finish as failed
    let retryFinal = retryRes.body.data;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 40));
      const check = await request(app).get(`/api/runs/${retryRunId}`);
      retryFinal = check.body.data;
      if (retryFinal.status === "failed" || retryFinal.status === "completed") {
        break;
      }
    }
    expect(retryFinal.status).toBe("failed");
    expect(retryFinal.exitCode).toBe(1);

    // Original run is still intact and completed
    const originalCheck = await request(app).get(`/api/runs/${runId}`);
    expect(originalCheck.body.data.status).toBe("completed");
  });

  it("5. Cancels an active demo run and transitions it cleanly to cancelled", async () => {
    const projRes = await request(app).post("/api/projects").send({ name: "Cancel Test" });
    const taskRes = await request(app).post("/api/tasks").send({
      projectId: projRes.body.data.id,
      title: "Long running task",
    });

    const runRes = await request(app).post("/api/runs").send({
      taskId: taskRes.body.data.id,
      providerId: "demo-agent",
      stepDelayMs: 800,
    });
    const runId = runRes.body.data.id;

    await new Promise((r) => setTimeout(r, 80));

    const cancelRes = await request(app)
      .post(`/api/runs/${runId}/cancel`)
      .send({ reason: "User clicked cancel in test" });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe("cancelled");
    expect(cancelRes.body.data.cancellationReason).toBe("User clicked cancel in test");

    // Cancelling an already-cancelled run returns 409
    const secondCancel = await request(app).post(`/api/runs/${runId}/cancel`);
    expect(secondCancel.status).toBe(409);
  });

  it("6. Rejects unknown providers and redacts secrets from provider configs", async () => {
    const projRes = await request(app).post("/api/projects").send({ name: "Sec Project" });
    const taskRes = await request(app).post("/api/tasks").send({
      projectId: projRes.body.data.id,
      title: "Sec Task",
    });

    const badProviderRun = await request(app).post("/api/runs").send({
      taskId: taskRes.body.data.id,
      providerId: "unknown-provider-xyz",
    });
    expect(badProviderRun.status).toBe(400);
    expect(badProviderRun.body.error.code).toBe("PROVIDER_ERROR");

    // Patch provider with a secret-named key and verify it is redacted in response
    const patchProv = await request(app)
      .patch("/api/providers/demo-agent")
      .send({
        config: {
          stepDelayMs: 500,
          apiKey: "sk-1234567890abcdef1234567890",
        },
      });
    expect(patchProv.status).toBe(200);
    expect(patchProv.body.data.config.apiKey).toBe("[REDACTED_SECRET]");
  });
});
