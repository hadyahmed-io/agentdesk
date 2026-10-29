import { AppError } from "../../middleware/error-handler.js";
import {
  providerRepository,
  type AgentProviderRecord,
} from "../../repositories/provider-repository.js";
import { DemoAgentProvider } from "../adapters/demo-provider.js";
import { AntigravityCliProvider } from "../adapters/antigravity-cli-provider.js";
import {
  ClaudeCodeCliProvider,
  LocalWorkspaceCliProvider,
} from "../adapters/local-cli-provider.js";
import type { AgentProvider, ProviderValidationResult } from "../interfaces/provider.js";

export class ProviderRegistry {
  private adapters = new Map<string, AgentProvider>();

  constructor() {
    this.register(new DemoAgentProvider());
    this.register(new LocalWorkspaceCliProvider());
    this.register(new ClaudeCodeCliProvider());
    this.register(new AntigravityCliProvider());
  }

  register(provider: AgentProvider): void {
    this.adapters.set(provider.id, provider);
  }

  getAdapter(id: string): AgentProvider {
    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new AppError(
        400,
        "PROVIDER_ERROR",
        `Unknown or unsupported agent provider '${id}'.`
      );
    }
    return adapter;
  }

  hasAdapter(id: string): boolean {
    return this.adapters.has(id);
  }

  /**
   * Resolves both the persisted database record and runtime adapter,
   * rejecting unknown, disabled, or unverified local CLI providers.
   */
  getExecutableProvider(id: string): {
    record: AgentProviderRecord;
    adapter: AgentProvider;
  } {
    const record = providerRepository.findById(id);
    if (!record) {
      throw new AppError(
        400,
        "PROVIDER_ERROR",
        `Provider '${id}' is not registered.`
      );
    }

    const adapter = this.adapters.get(id);
    if (!adapter) {
      throw new AppError(
        400,
        "PROVIDER_ERROR",
        `Provider '${id}' does not have an active runtime adapter.`
      );
    }

    if (!record.enabled) {
      throw new AppError(
        400,
        "PROVIDER_ERROR",
        `Provider '${record.name}' is currently disabled. Enable it on the Providers page before starting a run.`
      );
    }

    if (record.kind === "local_cli" && !record.isVerified) {
      throw new AppError(
        400,
        "PROVIDER_ERROR",
        `Provider '${record.name}' has not been verified yet. Run the provider verification test on the Providers page first.`
      );
    }

    return { record, adapter };
  }

  async verifyProvider(id: string): Promise<{
    provider: AgentProviderRecord;
    validation: ProviderValidationResult;
  }> {
    const record = providerRepository.findById(id);
    if (!record) {
      throw new AppError(404, "NOT_FOUND", `Provider '${id}' was not found.`);
    }

    const adapter = this.adapters.get(id);
    if (!adapter) {
      const failedValidation: ProviderValidationResult = {
        valid: false,
        message: `No runtime adapter implementation is registered for provider '${id}'.`,
      };
      const updated = providerRepository.recordVerificationResult(id, failedValidation)!;
      return { provider: updated, validation: failedValidation };
    }

    const validation = await adapter.validateConfiguration(record.config);
    const updated = providerRepository.recordVerificationResult(id, validation)!;
    return { provider: updated, validation };
  }
}

export const providerRegistry = new ProviderRegistry();
