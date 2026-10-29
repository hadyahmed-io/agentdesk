import { env } from "../config/env.js";
import { getSqlite, withTransaction } from "../database/client.js";
import type { ExecutionMode } from "../validators/schemas.js";

export interface AppSettingsObject {
  theme: "dark" | "light";
  dateFormat: "relative" | "iso" | "locale";
  defaultProjectSort: "updated_desc" | "created_desc" | "name_asc";
  defaultProviderId: string;
  defaultExecutionMode: ExecutionMode;
  logAutoScroll: boolean;
  defaultLogLevelFilter: "all" | "debug" | "info" | "warn" | "error";
  confirmDestructiveActions: boolean;
  approvedWorkspaceRoot: string;
  executionTimeoutMs: number;
}

const DEFAULT_SETTINGS: AppSettingsObject = {
  theme: "dark",
  dateFormat: "relative",
  defaultProjectSort: "updated_desc",
  defaultProviderId: "demo-agent",
  defaultExecutionMode: "demo",
  logAutoScroll: true,
  defaultLogLevelFilter: "all",
  confirmDestructiveActions: true,
  approvedWorkspaceRoot: env.APPROVED_WORKSPACE_ROOT,
  executionTimeoutMs: env.DEFAULT_EXECUTION_TIMEOUT_MS,
};

export class SettingsRepository {
  getAll(): AppSettingsObject {
    const sqlite = getSqlite();
    const rows = sqlite
      .prepare("SELECT key, value_json FROM app_settings")
      .all() as unknown as Array<{ key: string; value_json: string }>;

    const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      try {
        merged[row.key] = JSON.parse(row.value_json);
      } catch {
        // Ignore malformed setting value
      }
    }

    return merged as unknown as AppSettingsObject;
  }

  update(patch: Partial<AppSettingsObject>): AppSettingsObject {
    const now = new Date().toISOString();
    withTransaction((sqlite) => {
      const stmt = sqlite.prepare(`
        INSERT INTO app_settings (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `);
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) {
          stmt.run(key, JSON.stringify(value), now);
        }
      }
    });
    return this.getAll();
  }
}

export const settingsRepository = new SettingsRepository();
