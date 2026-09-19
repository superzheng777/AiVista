import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Environment } from "../../config/environment.js";
import type { GenerationToolRequest } from "../tools/index.js";
import { agentSessionContextSchema } from "../agent-context.js";

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
  contractVersion: z.literal(2),
  creationId: z.string().regex(/^\d+$/),
  revision: z.number().int().nonnegative(),
  status: z.enum(["RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
  sessionId: z.string().regex(/^\d+$/),
  prompt: z.string().min(1),
  agentContext: agentSessionContextSchema.nullable(),
  inputAssets: z.array(agentImageAssetSchema).max(3),
  constraints: z.object({
    aspectRatio: z.enum(["AUTO", "1:1", "4:3", "3:4", "16:9", "9:16"]),
    imageCount: z.number().int().min(0).max(6),
  }),
});

const errorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
}).passthrough();

export type AgentGenerationTaskResponse = z.infer<typeof responseSchema>;
export type AgentExecutionSnapshot = z.infer<typeof agentExecutionSchema>;
export type AgentImageAssetSnapshot = z.infer<typeof agentImageAssetSchema>;

export class JavaGenerationApiError extends Error {
  constructor(readonly status: number, readonly code: number | undefined, message: string) {
    super(message);
    this.name = "JavaGenerationApiError";
  }
}

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
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
      let response: Response;
      try {
        const timeout = AbortSignal.timeout(this.timeoutMs);
        response = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-AiVista-Worker-Token": this.token },
          body: JSON.stringify(request),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (error) {
        if (signal?.aborted || attempt === 2) throw error;
        lastError = error;
        await abortableDelay(100 * (attempt + 1), signal);
        continue;
      }
      if (response.ok) return responseSchema.parse(await response.json());
      const error = await apiError(response);
      if (response.status < 500 || attempt === 2) throw error;
      lastError = error;
      await abortableDelay(100 * (attempt + 1), signal);
    }
    throw lastError;
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
    if (!response.ok) throw await apiError(response);
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
    if (!response.ok) throw await apiError(response);
    return agentImageAssetSchema.parse(await response.json());
  }

  private requireReady(creationId: string): void {
    if (!this.token) throw new Error("Generation worker token is not configured");
    if (!/^\d+$/.test(creationId) || creationId === "0") {
      throw new TypeError("creationId must be a positive integer ID");
    }
  }
}

async function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); resolve(); }, milliseconds);
    const aborted = () => { clearTimeout(timer); cleanup(); reject(signal?.reason); };
    const cleanup = () => signal?.removeEventListener("abort", aborted);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

async function apiError(response: Response): Promise<JavaGenerationApiError> {
  try {
    const parsed = errorSchema.safeParse(await response.json());
    if (parsed.success) {
      return new JavaGenerationApiError(response.status, parsed.data.code, parsed.data.message);
    }
  } catch {
    // Normalize non-JSON infrastructure responses without exposing their body.
  }
  return new JavaGenerationApiError(response.status, undefined,
    `Java generation worker API returned HTTP ${response.status}`);
}
