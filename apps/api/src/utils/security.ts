import fs from "node:fs";
import path from "node:path";

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /\b(sk-[a-zA-Z0-9_-]{16,})\b/g,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    pattern: /\b(sk-ant-[a-zA-Z0-9_-]{16,})\b/g,
    replacement: "[REDACTED_ANTHROPIC_KEY]",
  },
  {
    pattern: /\b(ghp_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})\b/g,
    replacement: "[REDACTED_GITHUB_TOKEN]",
  },
  {
    pattern: /\b(AIza[0-9A-Za-z-_]{30,})\b/g,
    replacement: "[REDACTED_GOOGLE_KEY]",
  },
  {
    pattern: /\b(ya29\.[0-9A-Za-z_-]{16,})\b/g,
    replacement: "[REDACTED_GOOGLE_OAUTH_TOKEN]",
  },
  {
    pattern: /(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi,
    replacement: "$1[REDACTED_BEARER_TOKEN]",
  },
  {
    pattern: /((?:api[_-]?key|secret|token|password|passwd|authorization)\s*[:=]\s*["']?)([^"'\s,;}{]{6,})(["']?)/gi,
    replacement: "$1[REDACTED_SECRET]$3",
  },
];

/**
 * Redacts known credential, token, and secret patterns from strings or metadata objects.
 */
export function redactSecrets(input: string): string {
  if (!input) return input;
  let output = input;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export function redactMetadata(
  metadata?: Record<string, unknown> | null
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/secret|token|password|apikey|api_key|authorization|credential/i.test(key)) {
      sanitized[key] = "[REDACTED_SECRET]";
    } else if (typeof value === "string") {
      sanitized[key] = redactSecrets(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      sanitized[key] = redactMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export interface WorkspaceValidationResult {
  valid: boolean;
  resolvedPath?: string;
  exists?: boolean;
  isDirectory?: boolean;
  withinApprovedRoot?: boolean;
  reason?: string;
}

/**
 * Computes the default isolated workspace directory for a project under
 * `<approvedRoot>/workspaces/<project-slug>`, and optionally creates it on disk.
 */
export function resolveProjectWorkspaceDirectory(
  projectName: string,
  projectId: string,
  approvedRoot: string,
  ensureExists = false
): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const folderName = slug || projectId.replace(/[^a-zA-Z0-9-_]+/g, "-");
  const targetDir = path.resolve(approvedRoot, "workspaces", folderName);
  if (ensureExists) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

/**
 * Validates that a candidate directory path is safe, exists, is a directory,
 * and resolves inside the configured approved workspace root.
 */
export function validateWorkspacePath(
  candidatePath: string,
  approvedRoot: string,
  requireExists = true
): WorkspaceValidationResult {
  if (!candidatePath || !candidatePath.trim()) {
    return { valid: false, reason: "Directory path cannot be empty." };
  }

  if (candidatePath.includes("\0")) {
    return { valid: false, reason: "Directory path contains invalid null bytes." };
  }

  try {
    const resolvedRoot = path.resolve(approvedRoot);
    const resolvedCandidate = path.resolve(candidatePath.trim());

    const normRoot = process.platform === "win32" ? resolvedRoot.toLowerCase() : resolvedRoot;
    const normCandidate =
      process.platform === "win32" ? resolvedCandidate.toLowerCase() : resolvedCandidate;

    const relative = path.relative(normRoot, normCandidate);
    const withinApprovedRoot =
      relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

    if (!withinApprovedRoot) {
      return {
        valid: false,
        resolvedPath: resolvedCandidate,
        withinApprovedRoot: false,
        reason: `Path '${resolvedCandidate}' is outside the approved workspace root '${resolvedRoot}'.`,
      };
    }

    if (!requireExists) {
      return {
        valid: true,
        resolvedPath: resolvedCandidate,
        withinApprovedRoot: true,
      };
    }

    if (!fs.existsSync(resolvedCandidate)) {
      return {
        valid: false,
        resolvedPath: resolvedCandidate,
        exists: false,
        withinApprovedRoot: true,
        reason: `Directory '${resolvedCandidate}' does not exist on disk.`,
      };
    }

    const stat = fs.statSync(resolvedCandidate);
    if (!stat.isDirectory()) {
      return {
        valid: false,
        resolvedPath: resolvedCandidate,
        exists: true,
        isDirectory: false,
        withinApprovedRoot: true,
        reason: `Path '${resolvedCandidate}' exists but is not a directory.`,
      };
    }

    return {
      valid: true,
      resolvedPath: resolvedCandidate,
      exists: true,
      isDirectory: true,
      withinApprovedRoot: true,
    };
  } catch (err) {
    return {
      valid: false,
      reason: `Failed to resolve or inspect path: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Calculates success rate from runs with known terminal outcomes (completed vs failed + timed_out).
 * Excludes queued, starting, running, and cancelled runs from the denominator.
 */
export function calculateSuccessRate(counts: {
  completed: number;
  failed: number;
  timedOut?: number;
}): number | null {
  const completed = Math.max(0, counts.completed || 0);
  const failed = Math.max(0, counts.failed || 0);
  const timedOut = Math.max(0, counts.timedOut || 0);
  const totalTerminalEvaluated = completed + failed + timedOut;
  if (totalTerminalEvaluated === 0) {
    return null;
  }
  return Math.round((completed / totalTerminalEvaluated) * 1000) / 10;
}

/**
 * Calculates elapsed duration in milliseconds between two ISO timestamps.
 */
export function calculateDurationMs(
  startedAt?: string | null,
  endedAt?: string | null,
  nowMs: number = Date.now()
): number | null {
  if (!startedAt) return null;
  const startMs = Date.parse(startedAt);
  if (Number.isNaN(startMs)) return null;
  const endMs = endedAt ? Date.parse(endedAt) : nowMs;
  if (Number.isNaN(endMs)) return null;
  return Math.max(0, endMs - startMs);
}
