import path from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { closeDatabase, runMigrations } from "../database/client.js";
import { providerRegistry } from "../agents/registry/provider-registry.js";
import { AppError, formatZodError } from "../middleware/error-handler.js";
import {
  calculateDurationMs,
  calculateSuccessRate,
  redactMetadata,
  redactSecrets,
  validateWorkspacePath,
} from "../utils/security.js";
import {
  assertValidRunStatusTransition,
  canTransitionRunStatus,
  createProjectSchema,
  createTaskSchema,
} from "../validators/schemas.js";

describe("AgentDesk Unit Tests — Core Domain & Security Logic", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = ":memory:";
    closeDatabase();
    runMigrations(":memory:");
  });

  describe("1. Run Lifecycle State Machine Validation", () => {
    it("allows valid forward transitions", () => {
      expect(canTransitionRunStatus("queued", "starting")).toBe(true);
      expect(canTransitionRunStatus("starting", "running")).toBe(true);
      expect(canTransitionRunStatus("running", "completed")).toBe(true);
      expect(canTransitionRunStatus("running", "failed")).toBe(true);
      expect(canTransitionRunStatus("running", "cancelled")).toBe(true);
      expect(canTransitionRunStatus("running", "timed_out")).toBe(true);
      expect(canTransitionRunStatus("queued", "cancelled")).toBe(true);
    });

    it("rejects transitions out of terminal states", () => {
      expect(canTransitionRunStatus("completed", "running")).toBe(false);
      expect(canTransitionRunStatus("failed", "running")).toBe(false);
      expect(canTransitionRunStatus("cancelled", "starting")).toBe(false);
      expect(canTransitionRunStatus("timed_out", "queued")).toBe(false);

      expect(() =>
        assertValidRunStatusTransition("completed", "running")
      ).toThrow(/Invalid agent run status transition/);
    });
  });

  describe("2. Project & Task Schema Validation", () => {
    it("validates project creation and rejects empty names or invalid URLs", () => {
      const valid = createProjectSchema.safeParse({
        name: "  Core Engine  ",
        description: "Backend service",
        gitRepoUrl: "https://github.com/org/core-engine",
        tags: ["typescript", "backend"],
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.name).toBe("Core Engine");
      }

      const emptyName = createProjectSchema.safeParse({ name: "   " });
      expect(emptyName.success).toBe(false);

      const badUrl = createProjectSchema.safeParse({
        name: "Valid Name",
        gitRepoUrl: "not-a-valid-url",
      });
      expect(badUrl.success).toBe(false);
    });

    it("validates task status, priority, and acceptance criteria", () => {
      const valid = createTaskSchema.safeParse({
        projectId: "proj_123",
        title: "Implement pagination",
        status: "in_progress",
        priority: "urgent",
        acceptanceCriteria: [
          "Supports page and limit query params",
          "Returns total count",
        ],
      });
      expect(valid.success).toBe(true);

      const invalidStatus = createTaskSchema.safeParse({
        projectId: "proj_123",
        title: "Bad status",
        status: "unknown_status",
      });
      expect(invalidStatus.success).toBe(false);
    });
  });

  describe("3. Provider Registry & Configuration Validation", () => {
    it("returns registered demo provider and rejects unknown provider IDs", async () => {
      const { record, adapter } = providerRegistry.getExecutableProvider("demo-agent");
      expect(record.id).toBe("demo-agent");
      expect(record.kind).toBe("demo");
      expect(record.isSimulated).toBe(true);

      const validation = await adapter.validateConfiguration();
      expect(validation.valid).toBe(true);

      expect(() => providerRegistry.getExecutableProvider("non-existent-provider")).toThrow(
        AppError
      );
    });

    it("prevents unverified or disabled local CLI providers from executing", () => {
      expect(() => providerRegistry.getExecutableProvider("claude-code-cli")).toThrow(
        /currently disabled/i
      );
      expect(() => providerRegistry.getExecutableProvider("local-workspace-cli")).toThrow(
        /has not been verified yet/i
      );
    });

    it("verifies local-workspace-cli when Node and Git are available", async () => {
      const { provider, validation } = await providerRegistry.verifyProvider(
        "local-workspace-cli"
      );
      expect(validation.valid).toBe(true);
      expect(provider.isVerified).toBe(true);
    });
  });

  describe("4. Success Rate & Duration Calculations", () => {
    it("calculates success rate accurately from terminal outcomes and excludes queued/cancelled", () => {
      expect(calculateSuccessRate({ completed: 0, failed: 0, timedOut: 0 })).toBeNull();
      expect(calculateSuccessRate({ completed: 8, failed: 2, timedOut: 0 })).toBe(80);
      expect(calculateSuccessRate({ completed: 3, failed: 1, timedOut: 1 })).toBe(60);
    });

    it("calculates duration in milliseconds accurately", () => {
      const start = "2026-10-25T09:00:00.000Z";
      const end = "2026-10-25T09:00:04.250Z";
      expect(calculateDurationMs(start, end)).toBe(4250);
      expect(calculateDurationMs(null, end)).toBeNull();
    });
  });

  describe("5. Secret Redaction & Error Normalization", () => {
    it("redacts API keys, bearer tokens, and secret metadata keys", () => {
      const raw =
        "Connecting with sk-ant-api03-1234567890abcdef12345678 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and api_key=my_super_secret_token_99";
      const redacted = redactSecrets(raw);
      expect(redacted).not.toContain("1234567890abcdef12345678");
      expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(redacted).not.toContain("my_super_secret_token_99");
      expect(redacted).toContain("[REDACTED");

      const meta = redactMetadata({
        apiKey: "sk-12345678901234567890",
        normalField: "safe-value",
        nested: { token: "secret-val" },
      });
      expect(meta?.apiKey).toBe("[REDACTED_SECRET]");
      expect(meta?.normalField).toBe("safe-value");
      expect((meta?.nested as Record<string, unknown>)?.token).toBe("[REDACTED_SECRET]");
    });

    it("normalizes Zod errors into structured field-level error details", () => {
      const parsed = createProjectSchema.safeParse({ name: "" });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        const appErr = formatZodError(parsed.error);
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe("VALIDATION_ERROR");
        expect(appErr.details?.[0]?.field).toBe("name");
      }
    });
  });

  describe("6. Workspace Path Confinement & Validation", () => {
    it("accepts directories inside the approved root and rejects path traversal escapes", () => {
      const approvedRoot = process.cwd();
      const validResult = validateWorkspacePath(approvedRoot, approvedRoot, true);
      expect(validResult.valid).toBe(true);
      expect(validResult.withinApprovedRoot).toBe(true);

      const escapedPath = path.resolve(approvedRoot, "../../..");
      const escapeResult = validateWorkspacePath(escapedPath, approvedRoot, false);
      expect(escapeResult.valid).toBe(false);
      expect(escapeResult.withinApprovedRoot).toBe(false);
      expect(escapeResult.reason).toMatch(/outside the approved workspace root/i);
    });
  });
});
