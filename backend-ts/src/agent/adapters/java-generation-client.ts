import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Environment } from "../../config/environment.js";
import type { GenerationToolRequest } from "../tools/index.js";
import { agentSessionContextSchema } from "../agent-context.js";
import { creationFormResponseSchema } from "../agent-form-contract.js";
import { JavaWorkerApiError as JavaGenerationApiError, javaWorkerError,
  putJavaWorker } from "../../common/java-worker-http.js";

export { JavaWorkerApiError as JavaGenerationApiError } from "../../common/java-worker-http.js";

const responseSchema = z.object({
  generationTaskId: z.string().regex(/^\d+$/),
  sessionId: z.string().regex(/^\d+$/),
  status: z.enum(["QUEUED", "GENERATING", "SAVING", "SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED"]),
  revision: z.number().int().nonnegative(),
  requestedImageCount: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
});

const agentImageAssetSchema = z.object({
  assetId: z.string().regex(/^[1-9]\d*$/),
  objectKey: z.string().min(1),
  contentType: z.enum(["image/webp", "image/png", "image/jpeg"]),
  fileSize: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const agentExecutionSchema = z.object({
  contractVersion: z.literal(3),
  creationId: z.string().regex(/^\d+$/),
  revision: z.number().int().nonnegative(),
  status: z.enum(["RUNNING", "WAITING_INPUT", "SUCCEEDED", "FAILED", "CANCELLED"]),
  sessionId: z.string().regex(/^\d+$/),
  prompt: z.string().min(1),
  agentContext: agentSessionContextSchema.nullable(),
  inputAssets: z.array(agentImageAssetSchema).max(3),
  constraints: z.object({
    aspectRatio: z.enum(["AUTO", "1:1", "4:3", "3:4", "16:9", "9:16"]),
    imageCount: z.number().int().min(0).max(6),
  }),
  formResponse: creationFormResponseSchema.nullable(),
});

export type AgentGenerationTaskResponse = z.infer<typeof responseSchema>;
export type AgentExecutionSnapshot = z.infer<typeof agentExecutionSchema>;
export type AgentImageAssetSnapshot = z.infer<typeof agentImageAssetSchema>;

@Injectable()
export class JavaGenerationClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<Environment, true>) {
    this.baseUrl = config.get("AIVISTA_JAVA_BASE_URL", { infer: true }).replace(/\/$/, "");
    this.token = config.get("AIVISTA_GENERATION_WORKER_TOKEN", { infer: true });
    this.timeoutMs = config.get("AIVISTA_JAVA_REQUEST_TIMEOUT_MS", { infer: true });
  }

  async createTask(creationId: string, toolCallId: string,
      request: GenerationToolRequest, signal?: AbortSignal): Promise<AgentGenerationTaskResponse> {
    this.requireReady(creationId);
    if (!toolCallId || toolCallId.length > 128) {
      throw new TypeError("toolCallId must contain 1 to 128 characters");
    }
    const url = `${this.baseUrl}/internal/generation-worker/agent-creations/${creationId}`
      + `/generation-tasks/${encodeURIComponent(toolCallId)}`;
    const response = await putJavaWorker({ url, token: this.token!, body: request,
      timeoutMs: this.timeoutMs, signal, fallbackError: "Java generation worker API request failed" });
    return responseSchema.parse(await response.json());
  }

  async getAgentExecution(creationId: string, signal?: AbortSignal): Promise<AgentExecutionSnapshot> {
    this.requireReady(creationId);
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const response = await fetch(
      `${this.baseUrl}/internal/generation-worker/agent-creations/${creationId}/execution`,
      {
        headers: { "X-AiVista-Worker-Token": this.token! },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );
    if (!response.ok) throw await javaWorkerError(response,
      `Java generation worker API returned HTTP ${response.status}`);
    return agentExecutionSchema.parse(await response.json());
  }

  async resolveAgentImage(creationId: string, expectedRevision: number, assetId: string,
      signal?: AbortSignal): Promise<AgentImageAssetSnapshot> {
    this.requireReady(creationId);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new TypeError("expectedRevision must be a non-negative safe integer");
    }
    if (!/^[1-9]\d*$/.test(assetId)) throw new TypeError("assetId must be a positive integer ID");
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const response = await fetch(
      `${this.baseUrl}/internal/generation-worker/agent-creations/${creationId}`
        + `/assets/${assetId}?expectedRevision=${expectedRevision}`,
      {
        headers: { "X-AiVista-Worker-Token": this.token! },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      },
    );
    if (!response.ok) throw await javaWorkerError(response,
      `Java generation worker API returned HTTP ${response.status}`);
    return agentImageAssetSchema.parse(await response.json());
  }

  private requireReady(creationId: string): void {
    if (!this.token) throw new Error("Generation worker token is not configured");
    if (!/^\d+$/.test(creationId) || creationId === "0") {
      throw new TypeError("creationId must be a positive integer ID");
    }
  }
}
