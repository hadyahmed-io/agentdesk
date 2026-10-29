import type {
  AgentEvent,
  AgentProvider,
  AgentRunInput,
  AgentRunResult,
  ProviderValidationResult,
} from "../interfaces/provider.js";

export class DemoAgentProvider implements AgentProvider {
  readonly id = "demo-agent";
  readonly name = "AgentDesk Demo Simulator";
  readonly kind = "demo" as const;

  private activeControllers = new Map<string, AbortController>();

  async validateConfiguration(): Promise<ProviderValidationResult> {
    return {
      valid: true,
      message:
        "Simulated demo provider is ready. Works offline without API keys and never modifies local files.",
      details: {
        simulated: true,
        requiresNetwork: false,
        modifiesFiles: false,
      },
    };
  }

  async execute(
    input: AgentRunInput,
    emit: (event: AgentEvent) => Promise<void>
  ): Promise<AgentRunResult> {
    const controller = new AbortController();
    this.activeControllers.set(input.runId, controller);

    const stepDelay = Math.min(
      Math.max(
        Number(input.stepDelayMs ?? input.providerConfig?.stepDelayMs ?? 600),
        30
      ),
      5000
    );

    const outcome =
      input.simulatedOutcome ??
      (input.providerConfig?.simulatedOutcome as "completed" | "failed" | "timed_out" | undefined) ??
      (input.instructions.toLowerCase().includes("[simulate:fail]")
        ? "failed"
        : input.instructions.toLowerCase().includes("[simulate:timeout]")
        ? "timed_out"
        : "completed");

    const sleep = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        if (controller.signal.aborted) {
          reject(new Error("ABORTED"));
          return;
        }
        const timer = setTimeout(() => {
          controller.signal.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error("ABORTED"));
        };
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });

    try {
      await emit({
        timestamp: new Date().toISOString(),
        type: "simulated.init",
        stage: "Initializing Execution",
        level: "info",
        message: `[SIMULATED DEMO] Initializing demo execution for task "${input.taskTitle}" in project "${input.projectName}". No files or repositories will be modified.`,
        metadata: {
          simulated: true,
          runId: input.runId,
          projectId: input.projectId,
          taskId: input.taskId,
          stepDelayMs: stepDelay,
        },
      });
      await sleep(stepDelay);

      await emit({
        timestamp: new Date().toISOString(),
        type: "simulated.validate",
        stage: "Validating Task Specifications",
        level: "info",
        message: `[SIMULATED DEMO] Validated task instructions (${input.instructions.length} chars) and ${input.acceptanceCriteria?.length ?? 0} acceptance criteria item(s).`,
        metadata: {
          simulated: true,
          acceptanceCriteriaCount: input.acceptanceCriteria?.length ?? 0,
        },
      });
      await sleep(stepDelay);

      await emit({
        timestamp: new Date().toISOString(),
        type: "simulated.workspace",
        stage: "Preparing Virtual Workspace",
        level: "debug",
        message: `[SIMULATED DEMO] Prepared isolated in-memory workspace snapshot${
          input.workingDirectory ? ` referencing path '${input.workingDirectory}'` : ""
        }.`,
        metadata: {
          simulated: true,
          workingDirectory: input.workingDirectory ?? "(virtual workspace)",
          readOnly: true,
        },
      });
      await sleep(stepDelay);

      await emit({
        timestamp: new Date().toISOString(),
        type: "simulated.plan",
        stage: "Processing Task Instructions",
        level: "info",
        message: `[SIMULATED DEMO] Formulated execution plan for "${input.taskTitle}": inspect module boundaries, validate schema constraints, and verify acceptance criteria.`,
        metadata: {
          simulated: true,
          plannedSteps: 3,
        },
      });
      await sleep(stepDelay);

      if (outcome === "timed_out") {
        await emit({
          timestamp: new Date().toISOString(),
          type: "simulated.timeout",
          stage: "Processing Task Instructions",
          level: "error",
          message:
            "[SIMULATED DEMO] Simulated execution exceeded maximum allotted step budget and timed out.",
          metadata: {
            simulated: true,
            stage: "Processing Task Instructions",
          },
        });
        return {
          status: "timed_out",
          errorMessage:
            "Simulated run timed out during stage 'Processing Task Instructions'.",
          exitCode: 124,
          failedStage: "Processing Task Instructions",
        };
      }

      if (outcome === "failed") {
        await emit({
          timestamp: new Date().toISOString(),
          type: "simulated.validation_warning",
          stage: "Simulated Validation Step",
          level: "warn",
          message:
            "[SIMULATED DEMO] Warning: Simulated validation check detected an unmet acceptance criterion.",
          metadata: {
            simulated: true,
            check: "acceptance_criteria_verification",
          },
        });
        await sleep(Math.floor(stepDelay / 2));

        await emit({
          timestamp: new Date().toISOString(),
          type: "simulated.error",
          stage: "Simulated Validation Step",
          level: "error",
          message:
            "[SIMULATED DEMO] Simulated verification step failed with exit code 1 (assertion mismatch in simulated test suite).",
          metadata: {
            simulated: true,
            exitCode: 1,
            failedStage: "Simulated Validation Step",
          },
        });
        return {
          status: "failed",
          summary:
            "Simulated run terminated during validation step (configured to demonstrate failure handling).",
          errorMessage:
            "Simulated verification check failed at stage 'Simulated Validation Step' with exit code 1.",
          exitCode: 1,
          failedStage: "Simulated Validation Step",
        };
      }

      await emit({
        timestamp: new Date().toISOString(),
        type: "simulated.generate",
        stage: "Generating Simulated Result",
        level: "info",
        message: `[SIMULATED DEMO] Synthesized simulated solution summary for "${input.taskTitle}".`,
        metadata: {
          simulated: true,
          filesModified: 0,
        },
      });
      await sleep(stepDelay);

      await emit({
        timestamp: new Date().toISOString(),
        type: "simulated.verify",
        stage: "Performing Simulated Validation",
        level: "info",
        message: `[SIMULATED DEMO] Verified all ${
          input.acceptanceCriteria?.length || 1
        } acceptance check(s) in simulated runner (exit code 0).`,
        metadata: {
          simulated: true,
          checksPassed: input.acceptanceCriteria?.length || 1,
          exitCode: 0,
        },
      });
      await sleep(Math.floor(stepDelay / 2));

      const finalSummary = `[SIMULATED DEMO] Completed simulated workflow for "${input.taskTitle}" across 6 stages. No real files were modified.`;

      await emit({
        timestamp: new Date().toISOString(),
        type: "simulated.complete",
        stage: "Completed",
        level: "info",
        message: finalSummary,
        metadata: {
          simulated: true,
          exitCode: 0,
        },
      });

      return {
        status: "completed",
        summary: finalSummary,
        exitCode: 0,
      };
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.message === "ABORTED")) {
        await emit({
          timestamp: new Date().toISOString(),
          type: "simulated.cancelled",
          stage: "Cancelled",
          level: "warn",
          message: "[SIMULATED DEMO] Execution cancelled by user request. Cleaned up active timers.",
          metadata: {
            simulated: true,
          },
        });
        return {
          status: "cancelled",
          summary: "Simulated run was cancelled by user before completion.",
          exitCode: 130,
        };
      }

      return {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        exitCode: 1,
      };
    } finally {
      this.activeControllers.delete(input.runId);
    }
  }

  async cancel(runId: string): Promise<void> {
    const controller = this.activeControllers.get(runId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(runId);
    }
  }
}
