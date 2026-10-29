import type { AgentRunStatus, ExecutionMode, LogLevel, ProviderKind } from "../../validators/schemas.js";

export type { AgentRunStatus, ExecutionMode, LogLevel, ProviderKind };

export interface AgentRunInput {
  runId: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskTitle: string;
  instructions: string;
  acceptanceCriteria?: string[];
  workingDirectory?: string | null;
  approvedWorkspaceRoot: string;
  executionMode: ExecutionMode;
  allowFileEdits?: boolean;
  timeoutMs?: number;
  simulatedOutcome?: "completed" | "failed" | "timed_out";
  stepDelayMs?: number;
  providerConfig?: Record<string, unknown>;
}

export interface AgentEvent {
  timestamp: string;
  type: string;
  stage?: string;
  message: string;
  level?: LogLevel;
  metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
  status: "completed" | "failed" | "cancelled" | "timed_out";
  summary?: string;
  errorMessage?: string;
  exitCode?: number;
  failedStage?: string;
}

export interface ProviderValidationResult {
  valid: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface AgentProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderKind;

  validateConfiguration(config?: Record<string, unknown>): Promise<ProviderValidationResult>;

  execute(
    input: AgentRunInput,
    emit: (event: AgentEvent) => Promise<void>
  ): Promise<AgentRunResult>;

  cancel(runId: string): Promise<void>;
}
