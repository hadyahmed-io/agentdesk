import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import * as schema from "./schema/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sqliteInstance: DatabaseSync | null = null;
let drizzleInstance: SqliteRemoteDatabase<typeof schema> | null = null;
let currentDbPath: string | null = null;

function resolveDatabasePath(customPath?: string): string {
  const raw = customPath ?? process.env.DATABASE_URL ?? env.DATABASE_URL;
  if (raw === ":memory:") return ":memory:";
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), raw);
}

export function getSqlite(customPath?: string): DatabaseSync {
  const targetPath = resolveDatabasePath(customPath);
  if (sqliteInstance && currentDbPath === targetPath) {
    return sqliteInstance;
  }

  if (sqliteInstance) {
    try {
      sqliteInstance.close();
    } catch {
      // Ignore close error on old instance
    }
  }

  if (targetPath !== ":memory:") {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);
  db.exec("PRAGMA foreign_keys = ON;");
  if (targetPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec("PRAGMA busy_timeout = 5000;");

  sqliteInstance = db;
  currentDbPath = targetPath;
  drizzleInstance = createDrizzleProxy(db);
  return db;
}

function createDrizzleProxy(sqlite: DatabaseSync): SqliteRemoteDatabase<typeof schema> {
  return drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      const safeParams = (params ?? []).map((p) =>
        typeof p === "boolean" ? (p ? 1 : 0) : (p as SQLInputValue)
      );

      if (method === "run") {
        stmt.run(...safeParams);
        return { rows: [] };
      }

      if (method === "get") {
        stmt.setReturnArrays(true);
        const row = stmt.get(...safeParams);
        return { rows: (row as unknown as unknown[]) ?? undefined };
      }

      stmt.setReturnArrays(true);
      const rows = stmt.all(...safeParams);
      return { rows: rows as unknown as unknown[][] };
    },
    { schema }
  );
}

export function getDb(): SqliteRemoteDatabase<typeof schema> {
  if (!drizzleInstance) {
    getSqlite();
  }
  return drizzleInstance!;
}

export function closeDatabase(): void {
  if (sqliteInstance) {
    try {
      sqliteInstance.close();
    } catch {
      // Ignore errors
    }
    sqliteInstance = null;
    drizzleInstance = null;
    currentDbPath = null;
  }
}

/**
 * Executes a synchronous callback inside a SQLite transaction (`BEGIN IMMEDIATE` ... `COMMIT` / `ROLLBACK`).
 */
export function withTransaction<T>(fn: (sqlite: DatabaseSync) => T): T {
  const sqlite = getSqlite();
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(sqlite);
    sqlite.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {
      // Ignore rollback errors
    }
    throw err;
  }
}

/**
 * Runs versioned SQL migrations from `src/database/migrations` and initializes default providers & settings.
 */
export function runMigrations(customPath?: string): { applied: string[]; total: number } {
  const sqlite = getSqlite(customPath);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  let migrationsDir = path.resolve(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir) || !fs.readdirSync(migrationsDir).some((f) => f.endsWith(".sql"))) {
    const srcFallback = path.resolve(__dirname, "../../src/database/migrations");
    if (fs.existsSync(srcFallback)) {
      migrationsDir = srcFallback;
    }
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const appliedStmt = sqlite.prepare("SELECT id FROM _migrations WHERE id = ?");
  const recordStmt = sqlite.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)");
  const applied: string[] = [];

  for (const file of files) {
    const existing = appliedStmt.get(file);
    if (existing) continue;

    const sqlPath = path.join(migrationsDir, file);
    const sqlContent = fs.readFileSync(sqlPath, "utf8");

    sqlite.exec("BEGIN IMMEDIATE");
    try {
      sqlite.exec(sqlContent);
      recordStmt.run(file, new Date().toISOString());
      sqlite.exec("COMMIT");
      applied.push(file);
      logger.info(`Applied database migration: ${file}`);
    } catch (err) {
      sqlite.exec("ROLLBACK");
      logger.error(`Failed to apply migration ${file}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  ensureDefaultProvidersAndSettings(sqlite);

  return { applied, total: files.length };
}

function ensureDefaultProvidersAndSettings(sqlite: DatabaseSync): void {
  const now = new Date().toISOString();

  const upsertProvider = sqlite.prepare(`
    INSERT INTO agent_providers (
      id, name, kind, description, enabled, is_verified, last_verified_at, last_error, config_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  // 1. Built-in Demo Provider (Simulated Execution — always verified & ready offline)
  upsertProvider.run(
    "demo-agent",
    "AgentDesk Demo Simulator",
    "demo",
    "Deterministic multi-stage simulated coding agent. Emits structured lifecycle events, stage progress, and simulated verification logs without external API keys or file modifications.",
    1,
    1,
    now,
    null,
    JSON.stringify({
      stepDelayMs: 650,
      simulatedOutcome: "completed",
      profile: "full-lifecycle-simulator",
      modifiesFiles: false,
    }),
    now,
    now
  );

  // 2. Local Workspace Analyzer CLI Provider (Genuine local child_process.spawn adapter using Node & Git)
  upsertProvider.run(
    "local-workspace-cli",
    "Local Workspace Verifier (Node + Git CLI)",
    "local_cli",
    "Genuine local process provider that spawns node and git with strict argument arrays inside approved workspace directories to inspect repository state, git status, and project structure.",
    1,
    0,
    null,
    null,
    JSON.stringify({
      executable: "node",
      timeoutMs: 30000,
      readOnly: true,
      modifiesFiles: false,
      profile: "workspace-inspector",
    }),
    now,
    now
  );

  // 3. Claude Code Local CLI Adapter (Requires external `claude` CLI binary installed on PATH)
  upsertProvider.run(
    "claude-code-cli",
    "Claude Code CLI Adapter",
    "local_cli",
    "External coding agent adapter for Anthropic's official Claude Code CLI ('claude'). Requires the 'claude' executable on PATH and active local authentication.",
    0,
    0,
    null,
    "Not yet verified. Click 'Verify Provider' to check if 'claude' is installed on PATH.",
    JSON.stringify({
      executable: "claude",
      timeoutMs: 120000,
      allowFileEdits: false,
      modifiesFiles: false,
      requiresAuth: true,
      supportsStreaming: true,
      supportsCancellation: true,
      setupInstructions: [
        "Install Claude Code CLI globally: npm install -g @anthropic-ai/claude-code",
        "Run 'claude' in your terminal once to authenticate your account.",
        "Click 'Verify Provider' above to confirm installation and readiness.",
      ],
      profile: "claude-code-headless",
    }),
    now,
    now
  );

  // 4. Google Antigravity CLI Provider (Official `agy` CLI in headless `--print` mode)
  upsertProvider.run(
    "google-antigravity-cli",
    "Google Antigravity CLI (agy)",
    "local_cli",
    "Official Google Antigravity CLI ('agy') headless adapter. Executes tasks via 'agy --print --output-format stream-json --mode plan --sandbox' inside validated workspace directories.",
    1,
    0,
    null,
    "Not yet verified. Click 'Verify Provider' to check if 'agy' is installed on PATH and authenticated.",
    JSON.stringify({
      executable: "agy",
      outputFormat: "stream-json",
      sandbox: true,
      timeoutMs: 120000,
      allowFileEdits: false,
      modifiesFiles: false,
      requiresAuth: true,
      supportsStreaming: true,
      supportsCancellation: true,
      setupInstructions: [
        "Install the official Antigravity CLI ('agy') from https://antigravity.google/docs/getting-started?tab=cli (Windows PowerShell: irm https://antigravity.google/cli/install.ps1 | iex, macOS/Linux: curl -fsSL https://antigravity.google/cli/install.sh | bash).",
        "Authenticate by running 'agy' interactively once (creates ~/.gemini/antigravity-cli/settings.json) or set GEMINI_API_KEY / AGY_ADC_AUTH=true in the server environment.",
        "Click 'Verify Provider' to validate the 'agy' executable and authentication status before launching a run.",
      ],
      profile: "google-antigravity-headless",
    }),
    now,
    now
  );

  const upsertSetting = sqlite.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `);

  const defaultSettings: Record<string, unknown> = {
    theme: "dark",
    dateFormat: "relative",
    defaultProjectSort: "updated_desc",
    defaultProviderId: "demo-agent",
    defaultExecutionMode: "demo",
    logAutoScroll: true,
    defaultLogLevelFilter: "all",
    confirmDestructiveActions: true,
    executionTimeoutMs: env.DEFAULT_EXECUTION_TIMEOUT_MS,
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    upsertSetting.run(key, JSON.stringify(value), now);
  }
}
