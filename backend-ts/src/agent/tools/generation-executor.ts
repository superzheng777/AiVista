import { JavaGenerationApiError, type JavaGenerationClient } from "../adapters/java-generation-client.js";
import type { GenerationCompletionCoordinatorService } from "../../generation/generation-completion-coordinator.service.js";
import type { GenerationToolExecutor, GenerationToolOutcome, GenerationToolRequest } from "./generation.js";

export interface AgentGenerationToolExecutorOptions {
  creationId: string;
  generationClient: JavaGenerationClient;
  completionCoordinator: GenerationCompletionCoordinatorService;
  toolWaitTimeoutMs?: number;
}

/** Creation-scoped executor used by the two formal Pi generation tools. */
export class AgentGenerationToolExecutor implements GenerationToolExecutor {
  constructor(private readonly options: AgentGenerationToolExecutorOptions) {}

  async execute(toolCallId: string, request: GenerationToolRequest,
      signal?: AbortSignal): Promise<GenerationToolOutcome> {
    try {
      const timeoutSignal = AbortSignal.timeout(this.options.toolWaitTimeoutMs ?? 660_000);
      const executionSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const created = await this.options.generationClient.createTask(this.options.creationId,
        toolCallId, request, executionSignal);
      const completed = await this.options.completionCoordinator.wait(
        created.generationTaskId, executionSignal);
      if ((completed.status === "SUCCEEDED" || completed.status === "PARTIALLY_SUCCEEDED")
          && completed.assets.length > 0) {
        return { outcome: "SUCCEEDED", generationTaskId: completed.generationTaskId,
          imageAssetIds: completed.assets.map((asset) => asset.assetId) };
      }
      return { outcome: "FAILED", generationTaskId: completed.generationTaskId,
        code: completed.failureCode ?? "GENERATION_FAILED",
        message: "图片生成未成功，请根据错误调整方案。", retryable: true };
    } catch (error) {
      if (isAbort(error)) throw error;
      if (error instanceof JavaGenerationApiError) {
        return { outcome: "FAILED", code: `JAVA_${error.code ?? error.status}`,
          message: error.message, retryable: retryableJavaError(error) };
      }
      return { outcome: "FAILED", code: "GENERATION_SERVICE_UNAVAILABLE",
        message: "图片生成服务暂时不可用，请稍后再试。", retryable: true };
    }
  }
}

function retryableJavaError(error: JavaGenerationApiError): boolean {
  return error.status >= 500 || error.status === 409;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
