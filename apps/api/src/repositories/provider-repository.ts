import type { z } from "zod";
import { getSqlite, withTransaction } from "../database/client.js";
import { redactMetadata, redactSecrets } from "../utils/security.js";
import type {
  createProviderSchema,
  ProviderKind,
  updateProviderSchema,
} from "../validators/schemas.js";
import { activityRepository } from "./activity-repository.js";

export interface AgentProviderRecord {
  id: string;
  name: string;
  kind: ProviderKind;
  isSimulated: boolean;
  description: string;
  enabled: boolean;
  isVerified: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
  requiresAuth: boolean;
  supportsStreaming: boolean;
  supportsCancellation: boolean;
  installed: boolean | null;
  authenticated: boolean | null;
  setupInstructions: string[];
  lastVerificationMessage: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface RawProviderRow {
  id: string;
  name: string;
  kind: ProviderKind;
  description: string;
  enabled: number;
  is_verified: number;
  last_verified_at: string | null;
  last_error: string | null;
  config_json: string;
  created_at: string;
  updated_at: string;
}

const DEFAULT_SETUP_INSTRUCTIONS: Record<string, string[]> = {
  "demo-agent": [
    "No external installation or API key required. Ready for offline simulated runs immediately.",
  ],
  "local-workspace-cli": [
    "Requires Node.js and Git CLI installed on system PATH.",
    "Click 'Verify Provider' to validate local Node and Git binaries.",
  ],
  "claude-code-cli": [
    "Install Claude Code CLI globally: npm install -g @anthropic-ai/claude-code",
    "Run 'claude' in your terminal once to authenticate your account.",
    "Click 'Verify Provider' to confirm installation and readiness.",
  ],
  "google-antigravity-cli": [
    "Install the official Antigravity CLI ('agy') from https://antigravity.google/docs/getting-started?tab=cli (Windows PowerShell: irm https://antigravity.google/cli/install.ps1 | iex, macOS/Linux: curl -fsSL https://antigravity.google/cli/install.sh | bash).",
    "Authenticate by running 'agy' interactively once (~/.gemini/antigravity-cli/settings.json) or set GEMINI_API_KEY / AGY_ADC_AUTH=true in the server environment.",
    "Click 'Verify Provider' to validate the 'agy' executable and authentication status before launching a run.",
  ],
};

function mapProviderRow(row: RawProviderRow): AgentProviderRecord {
  let parsedConfig: Record<string, unknown> = {};
  try {
    parsedConfig = JSON.parse(row.config_json || "{}");
  } catch {
    parsedConfig = {};
  }
  const safeConfig = redactMetadata(parsedConfig) ?? {};

  const requiresAuth =
    typeof safeConfig.requiresAuth === "boolean"
      ? safeConfig.requiresAuth
      : row.id === "google-antigravity-cli" || row.id === "claude-code-cli";

  const supportsStreaming =
    typeof safeConfig.supportsStreaming === "boolean"
      ? safeConfig.supportsStreaming
      : true;

  const supportsCancellation =
    typeof safeConfig.supportsCancellation === "boolean"
      ? safeConfig.supportsCancellation
      : true;

  const installed =
    row.kind === "demo"
      ? true
      : typeof safeConfig.installed === "boolean"
      ? safeConfig.installed
      : row.is_verified !== 0
      ? true
      : null;

  const authenticated =
    !requiresAuth
      ? true
      : typeof safeConfig.authenticated === "boolean"
      ? safeConfig.authenticated
      : row.is_verified !== 0
      ? true
      : null;

  const setupInstructions = Array.isArray(safeConfig.setupInstructions)
    ? safeConfig.setupInstructions.map(String)
    : DEFAULT_SETUP_INSTRUCTIONS[row.id] ?? [
        "Ensure the provider binary is installed on PATH and click 'Verify Provider'.",
      ];

  const lastVerificationMessage =
    typeof safeConfig.lastVerificationMessage === "string"
      ? redactSecrets(safeConfig.lastVerificationMessage)
      : row.is_verified
      ? "Provider runtime verification succeeded."
      : row.last_error
      ? redactSecrets(row.last_error)
      : null;

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    isSimulated: row.kind === "demo",
    description: row.description,
    enabled: Boolean(row.enabled),
    isVerified: Boolean(row.is_verified),
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error ? redactSecrets(row.last_error) : null,
    requiresAuth,
    supportsStreaming,
    supportsCancellation,
    installed,
    authenticated,
    setupInstructions,
    lastVerificationMessage,
    config: safeConfig,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProviderRepository {
  list(): AgentProviderRecord[] {
    const sqlite = getSqlite();
    const rows = sqlite
      .prepare("SELECT * FROM agent_providers ORDER BY kind ASC, name ASC")
      .all() as unknown as RawProviderRow[];
    return rows.map(mapProviderRow);
  }

  findById(id: string): AgentProviderRecord | null {
    const sqlite = getSqlite();
    const row = sqlite
      .prepare("SELECT * FROM agent_providers WHERE id = ?")
      .get(id) as unknown as RawProviderRow | undefined;
    return row ? mapProviderRow(row) : null;
  }

  create(input: z.infer<typeof createProviderSchema>): AgentProviderRecord {
    const existing = this.findById(input.id);
    if (existing) {
      throw new Error(`Provider '${input.id}' already exists.`);
    }

    const now = new Date().toISOString();
    const safeConfig = redactMetadata(input.config) ?? {};
    const isDemo = input.kind === "demo";

    withTransaction((sqlite) => {
      sqlite
        .prepare(
          `INSERT INTO agent_providers (
            id, name, kind, description, enabled, is_verified,
            last_verified_at, last_error, config_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.id,
          input.name,
          input.kind,
          input.description ?? "",
          input.enabled ? 1 : 0,
          isDemo ? 1 : 0,
          isDemo ? now : null,
          isDemo ? null : "Provider has not been verified yet.",
          JSON.stringify(safeConfig),
          now,
          now
        );

      activityRepository.record({
        eventType: "provider.created",
        entityType: "provider",
        entityId: input.id,
        title: `Provider '${input.name}' registered`,
        description: `Registered ${input.kind === "demo" ? "simulated demo" : "local CLI"} provider.`,
      });
    });

    return this.findById(input.id)!;
  }

  update(
    id: string,
    patch: z.infer<typeof updateProviderSchema>
  ): AgentProviderRecord | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const nextName = patch.name ?? existing.name;
    const nextDesc = patch.description ?? existing.description;
    const nextEnabled = patch.enabled !== undefined ? patch.enabled : existing.enabled;
    const mergedConfig =
      patch.config !== undefined
        ? { ...existing.config, ...(redactMetadata(patch.config) ?? {}) }
        : existing.config;

    // When config changes on a local CLI provider, require re-verification
    const configChanged = patch.config !== undefined && existing.kind !== "demo";
    const nextVerified = configChanged ? false : existing.isVerified;

    withTransaction((sqlite) => {
      sqlite
        .prepare(
          `UPDATE agent_providers SET
            name = ?, description = ?, enabled = ?, is_verified = ?,
            config_json = ?, updated_at = ?
          WHERE id = ?`
        )
        .run(
          nextName,
          nextDesc,
          nextEnabled ? 1 : 0,
          nextVerified ? 1 : 0,
          JSON.stringify(mergedConfig),
          now,
          id
        );

      activityRepository.record({
        eventType: "provider.updated",
        entityType: "provider",
        entityId: id,
        title: `Provider '${nextName}' configuration updated`,
        description: `Provider is ${nextEnabled ? "enabled" : "disabled"}.`,
      });
    });

    return this.findById(id);
  }

  recordVerificationResult(
    id: string,
    result: { valid: boolean; message: string; details?: Record<string, unknown> }
  ): AgentProviderRecord | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const safeDetails = redactMetadata(result.details) ?? {};
    const nextConfig: Record<string, unknown> = {
      ...existing.config,
      lastVerificationMessage: redactSecrets(result.message),
      lastVerificationDetails: safeDetails,
      ...(typeof safeDetails.installed === "boolean"
        ? { installed: safeDetails.installed }
        : {}),
      ...(typeof safeDetails.authenticated === "boolean"
        ? { authenticated: safeDetails.authenticated }
        : {}),
    };

    withTransaction((sqlite) => {
      sqlite
        .prepare(
          `UPDATE agent_providers SET
            is_verified = ?,
            last_verified_at = ?,
            last_error = ?,
            config_json = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(
          result.valid ? 1 : 0,
          now,
          result.valid ? null : redactSecrets(result.message),
          JSON.stringify(nextConfig),
          now,
          id
        );

      activityRepository.record({
        eventType: result.valid ? "provider.verified" : "provider.verification_failed",
        entityType: "provider",
        entityId: id,
        title: result.valid
          ? `Provider '${existing.name}' verified`
          : `Provider '${existing.name}' verification failed`,
        description: redactSecrets(result.message),
      });
    });

    return this.findById(id);
  }
}

export const providerRepository = new ProviderRepository();
