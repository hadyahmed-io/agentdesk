import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  AntigravityCliProvider,
  type SpawnFunction,
} from "../agents/adapters/antigravity-cli-provider.js";
import type { AgentEvent } from "../agents/interfaces/provider.js";
import { providerRegistry } from "../agents/registry/provider-registry.js";
import { createApp } from "../app.js";
import { closeDatabase, runMigrations } from "../database/client.js";

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  kill(): boolean {
    this.killed = true;
    this.emit("close", 130, null);
    return true;
  }
}

function createMockSpawn(
  behavior: (
    command: string,
    args: readonly string[],
    proc: MockChildProcess
  ) => void
): SpawnFunction {
  return ((command: string, args: readonly string[]) => {
    const proc = new MockChildProcess();
    setImmediate(() => {
      behavior(command, args, proc);
    });
    return proc as unknown as ChildProcess;
  }) as SpawnFunction;
}

describe("AntigravityCliProvider (Google Antigravity CLI 'agy')", () => {
  const validWorkspace = path.resolve(process.cwd());

  it("1. Verifies successfully when 'agy --version' succeeds and authentication is configured", async () => {
    const spawnFn = createMockSpawn((cmd, args, proc) => {
      expect(cmd).toBe("agy");
      expect(args).toEqual(["--version"]);
      proc.stdout.emit("data", Buffer.from("agy version 2.1.0\n"));
      proc.emit("close", 0, null);
    });

    const provider = new AntigravityCliProvider({
      spawnFn,
      env: { GEMINI_API_KEY: "AIzaSyDummyKeyForVerificationTesting123456" },
      fsExistsSync: () => false,
    });

    const result = await provider.validateConfiguration();
    expect(result.valid).toBe(true);
    expect(result.message).toContain("agy version 2.1.0");
    expect(result.details?.installed).toBe(true);
    expect(result.details?.authenticated).toBe(true);
    expect(result.details?.supportsStreaming).toBe(true);
    expect(result.details?.supportsCancellation).toBe(true);
  });

  it("2. Fails verification clearly when 'agy' executable is missing on PATH (ENOENT)", async () => {
    const spawnFn = createMockSpawn((_cmd, _args, proc) => {
      const err = new Error("spawn agy ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      proc.emit("error", err);
    });

    const provider = new AntigravityCliProvider({
      spawnFn,
      env: {},
      fsExistsSync: () => false,
    });

    const result = await provider.validateConfiguration();
    expect(result.valid).toBe(false);
    expect(result.message).toContain("Executable 'agy' was not found on system PATH");
    expect(result.details?.installed).toBe(false);
    expect(result.details?.authenticated).toBe(false);
  });

  it("3. Fails verification when 'agy' is installed but authentication is missing or settings.json is invalid", async () => {
    const spawnFn = createMockSpawn((_cmd, _args, proc) => {
      proc.stdout.emit("data", Buffer.from("agy version 2.1.0\n"));
      proc.emit("close", 0, null);
    });

    // Case A: No env credentials and no ~/.gemini/antigravity-cli/settings.json
    const unauthProvider = new AntigravityCliProvider({
      spawnFn,
      env: {},
      fsExistsSync: () => false,
    });
    const unauthRes = await unauthProvider.validateConfiguration();
    expect(unauthRes.valid).toBe(false);
    expect(unauthRes.details?.installed).toBe(true);
    expect(unauthRes.details?.authenticated).toBe(false);
    expect(unauthRes.message).toContain("authentication is not configured");

    // Case B: ~/.gemini/antigravity-cli/settings.json exists but has malformed JSON
    const malformedProvider = new AntigravityCliProvider({
      spawnFn,
      env: {},
      fsExistsSync: () => true,
      fsReadFileSync: () => "{ invalid json ",
    });
    const malformedRes = await malformedProvider.validateConfiguration();
    expect(malformedRes.valid).toBe(false);
    expect(malformedRes.details?.installed).toBe(true);
    expect(malformedRes.details?.authenticated).toBe(false);
    expect(malformedRes.message).toContain("invalid JSON");
  });

  it("4. Executes 'agy --print' with stream-json, streams progress events, redacts secrets, and reports exit code 0", async () => {
    const spawnedCommands: Array<{ cmd: string; args: readonly string[] }> = [];
    const spawnFn = createMockSpawn((cmd, args, proc) => {
      spawnedCommands.push({ cmd, args });
      if (args[0] === "--version") {
        proc.stdout.emit("data", Buffer.from("agy 2.1.0\n"));
        proc.emit("close", 0, null);
        return;
      }

      // Emit stream-json lines including a secret token that must be redacted
      proc.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            type: "thought",
            thought: "Inspecting repository with key AIzaSySecretKey123456789012345678901234",
          }) + "\n"
        )
      );
      proc.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            type: "tool_call",
            name: "read_file",
          }) + "\n"
        )
      );
      proc.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            type: "result",
            result: "Completed audit with token ya29.a0AfH6SMBxSecretGoogleOAuthToken12345",
          }) + "\n"
        )
      );
      proc.emit("close", 0, null);
    });

    const provider = new AntigravityCliProvider({
      spawnFn,
      env: { GEMINI_API_KEY: "AIzaSyValidKey123456789012345678901234" },
      fsExistsSync: () => false,
    });

    const events: AgentEvent[] = [];
    const result = await provider.execute(
      {
        runId: "run_agy_success",
        projectId: "proj_1",
        projectName: "Test Project",
        taskId: "task_1",
        taskTitle: "Audit repository",
        instructions: "Summarize project structure",
        acceptanceCriteria: ["Must not modify files"],
        workingDirectory: validWorkspace,
        approvedWorkspaceRoot: validWorkspace,
        executionMode: "local",
        allowFileEdits: false,
      },
      async (ev) => {
        events.push(ev);
      }
    );

    expect(result.status).toBe("completed");
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("[REDACTED_GOOGLE_OAUTH_TOKEN]");
    expect(result.summary).not.toContain("ya29.a0AfH6SMBxSecretGoogleOAuthToken12345");

    const execCall = spawnedCommands.find((c) => c.args.includes("--print"));
    expect(execCall).toBeDefined();
    expect(execCall?.args).toEqual([
      "--print",
      expect.stringContaining("Summarize project structure"),
      "--output-format",
      "stream-json",
      "--mode",
      "plan",
      "--sandbox",
    ]);

    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).toContain("[REDACTED_GOOGLE_KEY]");
    expect(serializedEvents).not.toContain("AIzaSySecretKey123456789012345678901234");
    expect(events.some((e) => e.type === "antigravity.thought")).toBe(true);
    expect(events.some((e) => e.type === "antigravity.tool_call")).toBe(true);
    expect(events.some((e) => e.type === "antigravity.result")).toBe(true);
  });

  it("5. Never marks a run as completed when 'agy' exits with a non-zero code or emits an auth/stream error", async () => {
    const spawnFn = createMockSpawn((_cmd, args, proc) => {
      if (args[0] === "--version") {
        proc.stdout.emit("data", Buffer.from("agy 2.1.0\n"));
        proc.emit("close", 0, null);
        return;
      }
      proc.stderr.emit(
        "data",
        Buffer.from("Error: 401 Unauthorized - Invalid API key sk-secret123456789012345678\n")
      );
      proc.emit("close", 1, null);
    });

    const provider = new AntigravityCliProvider({
      spawnFn,
      env: { GEMINI_API_KEY: "dummy" },
      fsExistsSync: () => false,
    });

    const events: AgentEvent[] = [];
    const result = await provider.execute(
      {
        runId: "run_agy_fail",
        projectId: "proj_1",
        projectName: "Test Project",
        taskId: "task_1",
        taskTitle: "Fail auth",
        instructions: "Test failure handling",
        workingDirectory: validWorkspace,
        approvedWorkspaceRoot: validWorkspace,
        executionMode: "local",
      },
      async (ev) => {
        events.push(ev);
      }
    );

    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(1);
    expect(result.errorMessage).toContain("authentication failed");
    expect(result.errorMessage).toContain("[REDACTED_API_KEY]");
    expect(result.errorMessage).not.toContain("sk-secret123456789012345678");
  });

  it("6. Supports active run cancellation and execution timeout enforcement", async () => {
    // Test Cancellation
    const cancelSpawnFn = createMockSpawn((_cmd, args, proc) => {
      if (args[0] === "--version") {
        proc.stdout.emit("data", Buffer.from("agy 2.1.0\n"));
        proc.emit("close", 0, null);
        return;
      }
      // Hang until cancelled
    });

    const cancelProvider = new AntigravityCliProvider({
      spawnFn: cancelSpawnFn,
      env: { GEMINI_API_KEY: "dummy" },
      fsExistsSync: () => false,
    });

    const runPromise = cancelProvider.execute(
      {
        runId: "run_to_cancel",
        projectId: "proj_1",
        projectName: "Test Project",
        taskId: "task_1",
        taskTitle: "Long task",
        instructions: "Wait for cancel",
        workingDirectory: validWorkspace,
        approvedWorkspaceRoot: validWorkspace,
        executionMode: "local",
      },
      async () => {}
    );

    await new Promise((r) => setTimeout(r, 30));
    await cancelProvider.cancel("run_to_cancel");
    const cancelResult = await runPromise;
    expect(cancelResult.status).toBe("cancelled");
    expect(cancelResult.exitCode).toBe(130);

    // Test Timeout
    const timeoutSpawnFn = ((cmd: string, args: readonly string[]) => {
      const proc = new MockChildProcess();
      proc.kill = () => {
        proc.killed = true;
        proc.emit("close", 124, "SIGKILL");
        return true;
      };
      setImmediate(() => {
        if (args[0] === "--version") {
          proc.stdout.emit("data", Buffer.from("agy 2.1.0\n"));
          proc.emit("close", 0, null);
        }
      });
      return proc as unknown as ChildProcess;
    }) as SpawnFunction;

    const timeoutProvider = new AntigravityCliProvider({
      spawnFn: timeoutSpawnFn,
      env: { GEMINI_API_KEY: "dummy" },
      fsExistsSync: () => false,
    });

    const timeoutResult = await timeoutProvider.execute(
      {
        runId: "run_to_timeout",
        projectId: "proj_1",
        projectName: "Test Project",
        taskId: "task_1",
        taskTitle: "Timeout task",
        instructions: "Wait for timeout",
        workingDirectory: validWorkspace,
        approvedWorkspaceRoot: validWorkspace,
        executionMode: "local",
        timeoutMs: 1000,
      },
      async () => {}
    );

    expect(timeoutResult.status).toBe("timed_out");
    expect(timeoutResult.exitCode).toBe(124);
  });

  it("7. Rejects workspace paths outside approvedWorkspaceRoot before spawning 'agy'", async () => {
    let spawned = false;
    const spawnFn = createMockSpawn(() => {
      spawned = true;
    });

    const provider = new AntigravityCliProvider({
      spawnFn,
      env: { GEMINI_API_KEY: "dummy" },
    });

    const outsideDir = path.resolve(os.tmpdir(), "..");
    const result = await provider.execute(
      {
        runId: "run_outside_root",
        projectId: "proj_1",
        projectName: "Test Project",
        taskId: "task_1",
        taskTitle: "Path escape attempt",
        instructions: "Do not allow",
        workingDirectory: outsideDir,
        approvedWorkspaceRoot: validWorkspace,
        executionMode: "local",
      },
      async () => {}
    );

    expect(result.status).toBe("failed");
    expect(result.failedStage).toBe("Validating Workspace Path");
    expect(spawned).toBe(false);
  });

  it("8. Registers 'google-antigravity-cli' in ProviderRegistry and API /api/providers", async () => {
    process.env.DATABASE_URL = ":memory:";
    closeDatabase();
    runMigrations(":memory:");

    expect(providerRegistry.hasAdapter("google-antigravity-cli")).toBe(true);

    const app = createApp();
    const res = await request(app).get("/api/providers");
    expect(res.status).toBe(200);

    const agyProvider = res.body.data.find(
      (p: { id: string }) => p.id === "google-antigravity-cli"
    );
    expect(agyProvider).toBeDefined();
    expect(agyProvider.name).toBe("Google Antigravity CLI (agy)");
    expect(agyProvider.kind).toBe("local_cli");
    expect(agyProvider.requiresAuth).toBe(true);
    expect(agyProvider.supportsStreaming).toBe(true);
    expect(agyProvider.supportsCancellation).toBe(true);
    expect(Array.isArray(agyProvider.setupInstructions)).toBe(true);
    expect(agyProvider.setupInstructions.length).toBeGreaterThan(0);
  });
});
