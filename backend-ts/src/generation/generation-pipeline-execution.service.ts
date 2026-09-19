import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Selectable } from "kysely";
import type { Environment } from "../config/environment.js";
import type { GenerationTaskTable } from "../database/database.types.js";
import { GenerationBailianClientService } from "./generation-bailian-client.service.js";
import { GenerationCompletionClientService } from "./generation-completion-client.service.js";
import { generationCompleted, generationFailed, type GenerationCompletion } from "./generation-completion.js";
import { GenerationImageTransferService } from "./generation-image-transfer.service.js";
import { GenerationPipelineStateService } from "./generation-pipeline-state.service.js";
import { BailianProviderError, BailianTransportError, providerFailureCode } from "./generation-provider-error.js";
import { GenerationProviderCallGateService } from "./generation-provider-call-gate.service.js";
import type { TaskExecuteMessage } from "./generation-task-message.js";
import { GenerationCompletionCoordinatorService } from "./generation-completion-coordinator.service.js";

@Injectable()
export class GenerationPipelineExecutionService {
  private readonly logger = new Logger(GenerationPipelineExecutionService.name);
  private readonly maxRetries: number;
  private readonly active = new Set<string>();

  constructor(config: ConfigService<Environment, true>, private readonly state: GenerationPipelineStateService,
    private readonly java: GenerationCompletionClientService, private readonly bailian: GenerationBailianClientService,
    private readonly transfer: GenerationImageTransferService, private readonly gate: GenerationProviderCallGateService,
    private readonly completionCoordinator: GenerationCompletionCoordinatorService) {
    this.maxRetries = config.get("AIVISTA_BAILIAN_MAX_RETRIES", { infer: true });
  }

  async execute(message: TaskExecuteMessage, signal?: AbortSignal): Promise<boolean> {
    const executionKey = `${message.generationTaskId}:${message.expectedRevision}`;
    // The outbox is at-least-once. A concurrently delivered duplicate must not
    // interpret this instance's in-flight provider call as a crashed call.
    if (this.active.has(executionKey)) return true;
    this.active.add(executionKey);
    try { return await this.executeOnce(message, signal); }
    finally { this.active.delete(executionKey); }
  }

  private async executeOnce(message: TaskExecuteMessage, signal?: AbortSignal): Promise<boolean> {
    const plan = await this.state.prepare(message);
    if (plan.kind === "IGNORE_MESSAGE") return true;
    if (plan.kind === "DELIVER_COMMITTED_RESULT") return this.deliverCommitted(message.generationTaskId);
    if (plan.kind === "FAIL_INTERRUPTED_PIPELINE") {
      this.logger.warn(`Generation pipeline was interrupted for task ${message.generationTaskId}`);
      return this.commit(generationFailed(message.generationTaskId, plan.task.revision,
        "PROVIDER_CALL_OUTCOME_UNKNOWN", plan.task.provider_request_id));
    }
    const generating = await this.java.reportPhase(message.generationTaskId, "GENERATING", signal);
    if (terminal(generating.status)) return this.deliverCommitted(message.generationTaskId);
    let provider;
    try {
      provider = await this.generateWithRetry(plan.task, signal);
    } catch (error) {
      if (isAbort(error)) return false;
      const code = error instanceof BailianProviderError ? providerFailureCode(error)
        : error instanceof BailianTransportError && error.requestDefinitelyUnsent
          ? "PROVIDER_CONNECTION_FAILED" : "PROVIDER_CALL_OUTCOME_UNKNOWN";
      this.logger.warn(`Generation pipeline provider failed for task ${message.generationTaskId}: ${errorName(error)}`);
      return this.commit(generationFailed(message.generationTaskId, generating.revision, code,
        error instanceof BailianProviderError ? error.requestId : null));
    }
    const saving = await this.java.reportPhase(message.generationTaskId, "SAVING", signal);
    if (terminal(saving.status)) return this.deliverCommitted(message.generationTaskId);
    return this.transferAndCommit(message.generationTaskId, saving.revision, plan.task,
      provider.requestId, provider.snapshot);
  }

  private async transferAndCommit(taskId: bigint, completionVersion: number,
    task: Selectable<GenerationTaskTable>, providerRequestId: string | null, snapshot: string): Promise<boolean> {
    let completion: GenerationCompletion;
    try {
      const provider = this.bailian.restore(snapshot);
      const images = await this.transfer.transfer(task, provider.imageUrls);
      completion = generationCompleted(taskId, completionVersion, providerRequestId,
        provider.imageUrls.length, images);
    } catch (error) {
      this.logger.warn(`Generation pipeline transfer failed for task ${taskId}: ${errorName(error)}`);
      completion = generationFailed(taskId, completionVersion, "IMAGE_TRANSFER_FAILED", providerRequestId);
    }
    return this.commit(completion);
  }

  private async commit(completion: GenerationCompletion): Promise<boolean> {
    this.completionCoordinator.complete(await this.java.complete(completion));
    return true;
  }

  private async deliverCommitted(taskId: bigint): Promise<boolean> {
    this.completionCoordinator.complete(await this.java.getCompletion(taskId));
    return true;
  }

  private async generateWithRetry(task: Selectable<GenerationTaskTable>, signal?: AbortSignal) {
    for (let attempt = 0; ; attempt++) {
      let release: (() => void) | undefined;
      try {
        release = await this.gate.acquire(signal);
        return await this.bailian.generate(task);
      } catch (error) {
        if (attempt >= this.maxRetries || !retryable(error)) throw error;
        await delay(1000 * (1 << attempt), signal);
      } finally { release?.(); }
    }
  }
}

function retryable(error: unknown) {
  if (error instanceof BailianTransportError) return error.requestDefinitelyUnsent;
  return error instanceof BailianProviderError
    && ["PROVIDER_RATE_LIMITED", "PROVIDER_SERVICE_UNAVAILABLE"].includes(providerFailureCode(error));
}
function delay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}
function isAbort(error: unknown) { return error instanceof DOMException && error.name === "AbortError"; }
function errorName(error: unknown) { return error instanceof Error ? error.name : "UnknownError"; }
function terminal(status: string) { return ["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED"].includes(status); }
