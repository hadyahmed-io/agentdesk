import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { closeDatabase, runMigrations } from "../database/client.js";

describe("AgentDesk Persistence Across Restart & Real Local CLI Execution", () => {
  const tempDbPath = path.join(
    os.tmpdir(),
    `agentdesk_persistence_${Date.now()}.sqlite`
  );

  afterAll(() => {
    closeDatabase();
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      const f = `${tempDbPath}${suffix}`;
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // Ignore cleanup error
        }
      }
    }
  });

  it("1. Persists project, task, demo run, logs, and settings across database close and server restart", async () => {
    process.env.DATABASE_URL = tempDbPath;
    closeDatabase();
    runMigrations(tempDbPath);

    const appInstance1 = createApp();

    // Step 1: Create project
    const projRes = await request(appInstance1).post("/api/projects").send({
      name: "Persistent Repo",
      description: "Testing on-disk SQLite durability across restart",
      localPath: process.cwd(),
    });
    expect(projRes.status).toBe(201);
    const projectId = projRes.body.data.id;

    // Step 2: Create task
    const taskRes = await request(appInstance1).post("/api/tasks").send({
      projectId,
      title: "Verify SQLite WAL persistence",
      priority: "high",
      acceptanceCriteria: ["Data survives database close and reopen"],
    });
    expect(taskRes.status).toBe(201);
    const taskId = taskRes.body.data.id;

    // Step 3: Update settings
    await request(appInstance1)
      .patch("/api/settings")
      .send({ theme: "light" });

    // Step 4: Run demo provider and wait for completion
    const runRes = await request(appInstance1).post("/api/runs").send({
      taskId,
      providerId: "demo-agent",
      stepDelayMs: 35,
    });
    expect(runRes.status).toBe(201);
    const runId = runRes.body.data.id;

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 40));
      const check = await request(appInstance1).get(`/api/runs/${runId}`);
      if (check.body.data.status === "completed") break;
    }

    // Step 5: Stop server / close SQLite connection completely
    closeDatabase();

    // Step 6: Restart server and reopen SQLite file from disk
    runMigrations(tempDbPath);
    const appInstance2 = createApp();

    const checkProj = await request(appInstance2).get(`/api/projects/${projectId}`);
    expect(checkProj.status).toBe(200);
    expect(checkProj.body.data.name).toBe("Persistent Repo");

    const checkTask = await request(appInstance2).get(`/api/tasks/${taskId}`);
    expect(checkTask.status).toBe(200);
    expect(checkTask.body.data.title).toBe("Verify SQLite WAL persistence");

    const checkRun = await request(appInstance2).get(`/api/runs/${runId}`);
    expect(checkRun.status).toBe(200);
    expect(checkRun.body.data.status).toBe("completed");

    const checkLogs = await request(appInstance2).get(`/api/runs/${runId}/logs`);
    expect(checkLogs.status).toBe(200);
    expect(checkLogs.body.data.length).toBeGreaterThanOrEqual(5);

    const checkSettings = await request(appInstance2).get("/api/settings");
    expect(checkSettings.body.data.settings.theme).toBe("light");
  });

  it("2. Verifies and executes the genuine Local Workspace CLI provider (child_process.spawn with node & git)", async () => {
    process.env.DATABASE_URL = ":memory:";
    closeDatabase();
    runMigrations(":memory:");

    const app = createApp();

    // Configure approved workspace root to current repo root
    const repoRoot = path.resolve(process.cwd());
    await request(app)
      .patch("/api/settings")
      .send({ approvedWorkspaceRoot: repoRoot });

    // Verify local-workspace-cli provider
    const verifyRes = await request(app).post(
      "/api/providers/local-workspace-cli/test"
    );
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.validation.valid).toBe(true);
    expect(verifyRes.body.data.provider.isVerified).toBe(true);

    // Create project & task targeting repoRoot
    const projRes = await request(app).post("/api/projects").send({
      name: "AgentDesk Monorepo",
      localPath: repoRoot,
    });
    const taskRes = await request(app).post("/api/tasks").send({
      projectId: projRes.body.data.id,
      title: "Inspect local repository status via CLI",
    });

    // Launch real local CLI run
    const runRes = await request(app).post("/api/runs").send({
      taskId: taskRes.body.data.id,
      providerId: "local-workspace-cli",
      executionMode: "local",
    });
    expect(runRes.status).toBe(201);
    const runId = runRes.body.data.id;
    expect(runRes.body.data.isSimulated).toBe(false);

    let finalRun = runRes.body.data;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 80));
      const check = await request(app).get(`/api/runs/${runId}`);
      finalRun = check.body.data;
      if (finalRun.status === "completed" || finalRun.status === "failed") {
        break;
      }
    }

    expect(finalRun.status).toBe("completed");
    expect(finalRun.exitCode).toBe(0);

    const logsRes = await request(app).get(`/api/runs/${runId}/logs`);
    expect(logsRes.status).toBe(200);
    const messages = logsRes.body.data.map((l: { message: string }) => l.message);
    expect(
      messages.some((m: string) =>
        m.includes("[LOCAL-CLI] Read-only workspace inspection completed")
      )
    ).toBe(true);
  });

  it("3. Starts empty, persists 'My First Project' + 1 task across restart, and safely loads/removes demo data without touching user records", async () => {
    const workflowDbPath = path.join(
      os.tmpdir(),
      `agentdesk_my_first_project_${Date.now()}.sqlite`
    );
    try {
      process.env.DATABASE_URL = workflowDbPath;
      closeDatabase();
      runMigrations(workflowDbPath);

      const app1 = createApp();

      // 1. Fresh installation starts with an empty workspace
      const initialMetrics = await request(app1).get("/api/metrics");
      expect(initialMetrics.status).toBe(200);
      expect(initialMetrics.body.data.totalProjects).toBe(0);
      expect(initialMetrics.body.data.totalTasks).toBe(0);
      expect(initialMetrics.body.data.totalRuns).toBe(0);

      const initialActivity = await request(app1).get("/api/activity");
      expect(initialActivity.body.data).toHaveLength(0);

      // 2. Create a project named "My First Project"
      const createProj = await request(app1).post("/api/projects").send({
        name: "My First Project",
        description: "User-created workspace project",
      });
      expect(createProj.status).toBe(201);
      const myProjectId = createProj.body.data.id;

      // 3. Create one task inside it
      const createTask = await request(app1).post("/api/tasks").send({
        projectId: myProjectId,
        title: "Implement initial feature",
        status: "todo",
        priority: "medium",
      });
      expect(createTask.status).toBe(201);
      const myTaskId = createTask.body.data.id;

      // 4. Confirm dashboard metrics show the exact project and task counts
      const afterCreateMetrics = await request(app1).get("/api/metrics");
      expect(afterCreateMetrics.body.data.totalProjects).toBe(1);
      expect(afterCreateMetrics.body.data.activeProjects).toBe(1);
      expect(afterCreateMetrics.body.data.totalTasks).toBe(1);
      expect(afterCreateMetrics.body.data.openTasks).toBe(1);
      expect(afterCreateMetrics.body.data.totalRuns).toBe(0);

      // 5. Restart the application and verify that the records persist
      closeDatabase();
      runMigrations(workflowDbPath);
      const app2 = createApp();

      const persistedMetrics = await request(app2).get("/api/metrics");
      expect(persistedMetrics.body.data.totalProjects).toBe(1);
      expect(persistedMetrics.body.data.openTasks).toBe(1);

      const persistedProjects = await request(app2).get("/api/projects");
      expect(persistedProjects.body.data).toHaveLength(1);
      expect(persistedProjects.body.data[0].name).toBe("My First Project");
      expect(persistedProjects.body.data[0].openTaskCount).toBe(1);

      // 6. Explicitly load demo data and then remove demo data; verify user records remain untouched
      const seedRes = await request(app2).post("/api/seed");
      expect(seedRes.status).toBe(201);
      expect(seedRes.body.data.projectsCreated).toBe(3);

      const metricsWithDemo = await request(app2).get("/api/metrics");
      expect(metricsWithDemo.body.data.totalProjects).toBe(4);
      expect(metricsWithDemo.body.data.demoProjectsCount).toBe(3);

      const clearRes = await request(app2).delete("/api/seed");
      expect(clearRes.status).toBe(200);
      expect(clearRes.body.data.projectsRemoved).toBe(3);

      const metricsAfterClear = await request(app2).get("/api/metrics");
      expect(metricsAfterClear.body.data.totalProjects).toBe(1);
      expect(metricsAfterClear.body.data.demoProjectsCount).toBe(0);
      expect(metricsAfterClear.body.data.openTasks).toBe(1);

      // 7. Run demo provider on the user task and verify output is explicitly labeled as simulated
      const simRunRes = await request(app2).post("/api/runs").send({
        taskId: myTaskId,
        providerId: "demo-agent",
        stepDelayMs: 35,
      });
      expect(simRunRes.status).toBe(201);
      expect(simRunRes.body.data.isSimulated).toBe(true);
      expect(simRunRes.body.data.executionMode).toBe("demo");

      const simRunId = simRunRes.body.data.id;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 40));
        const check = await request(app2).get(`/api/runs/${simRunId}`);
        if (check.body.data.status === "completed") break;
      }

      const finalSimRun = await request(app2).get(`/api/runs/${simRunId}`);
      expect(finalSimRun.body.data.status).toBe("completed");
      expect(finalSimRun.body.data.isSimulated).toBe(true);
      expect(finalSimRun.body.data.summary).toContain("[SIMULATED DEMO]");
    } finally {
      closeDatabase();
      for (const suffix of ["", "-wal", "-shm", "-journal"]) {
        const f = `${workflowDbPath}${suffix}`;
        if (fs.existsSync(f)) {
          try {
            fs.unlinkSync(f);
          } catch {
            // Ignore cleanup error
          }
        }
      }
    }
  });

  it("4. Automatically creates an isolated workspaces/<project-slug> directory when Local Path is empty and respects explicit Local Path when provided", async () => {
    const tempWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "agentdesk_ws_root_")
    );
    const explicitProjectDir = path.join(tempWorkspaceRoot, "custom-explicit-repo");
    fs.mkdirSync(explicitProjectDir, { recursive: true });

    try {
      process.env.DATABASE_URL = ":memory:";
      closeDatabase();
      runMigrations(":memory:");

      const app = createApp();

      // Configure approvedWorkspaceRoot to our isolated temp directory
      await request(app)
        .patch("/api/settings")
        .send({ approvedWorkspaceRoot: tempWorkspaceRoot });

      // Verify local-workspace-cli provider
      const verifyRes = await request(app).post(
        "/api/providers/local-workspace-cli/test"
      );
      expect(verifyRes.status).toBe(200);

      // A) Create a project WITHOUT localPath -> must auto-assign workspaces/auto-isolated-service
      const autoProjRes = await request(app).post("/api/projects").send({
        name: "Auto Isolated Service",
        description: "Project with no explicit localPath",
      });
      expect(autoProjRes.status).toBe(201);
      const expectedAutoDir = path.resolve(
        tempWorkspaceRoot,
        "workspaces",
        "auto-isolated-service"
      );
      expect(autoProjRes.body.data.localPath).toBe(expectedAutoDir);
      expect(autoProjRes.body.data.localPath).not.toBe(tempWorkspaceRoot);

      const autoTaskRes = await request(app).post("/api/tasks").send({
        projectId: autoProjRes.body.data.id,
        title: "Verify automatic isolated workspace creation",
      });

      const autoRunRes = await request(app).post("/api/runs").send({
        taskId: autoTaskRes.body.data.id,
        providerId: "local-workspace-cli",
        executionMode: "local",
      });
      expect(autoRunRes.status).toBe(201);
      expect(fs.existsSync(expectedAutoDir)).toBe(true);
      expect(autoRunRes.body.data.configSnapshot.workingDirectory).toBe(
        expectedAutoDir
      );

      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 60));
        const check = await request(app).get(
          `/api/runs/${autoRunRes.body.data.id}`
        );
        if (
          check.body.data.status === "completed" ||
          check.body.data.status === "failed"
        ) {
          break;
        }
      }

      // B) Create a project WITH an explicit localPath -> must respect explicitProjectDir
      const explicitProjRes = await request(app).post("/api/projects").send({
        name: "Explicit Path Service",
        localPath: explicitProjectDir,
      });
      expect(explicitProjRes.status).toBe(201);
      expect(explicitProjRes.body.data.localPath).toBe(explicitProjectDir);

      const explicitTaskRes = await request(app).post("/api/tasks").send({
        projectId: explicitProjRes.body.data.id,
        title: "Verify explicit workspace directory is respected",
      });

      const explicitRunRes = await request(app).post("/api/runs").send({
        taskId: explicitTaskRes.body.data.id,
        providerId: "local-workspace-cli",
        executionMode: "local",
      });
      expect(explicitRunRes.status).toBe(201);
      expect(explicitRunRes.body.data.configSnapshot.workingDirectory).toBe(
        explicitProjectDir
      );

      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 60));
        const check = await request(app).get(
          `/api/runs/${explicitRunRes.body.data.id}`
        );
        if (
          check.body.data.status === "completed" ||
          check.body.data.status === "failed"
        ) {
          break;
        }
      }
    } finally {
      closeDatabase();
      fs.rmSync(tempWorkspaceRoot, { recursive: true, force: true });
    }
  });
});
