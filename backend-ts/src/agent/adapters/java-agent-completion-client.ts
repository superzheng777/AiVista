import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Environment } from "../../config/environment.js";
import { JavaGenerationApiError } from "./java-generation-client.js";
import { agentSessionContextSchema } from "../agent-context.js";

const activitySchema = z.object({
  type: z.enum(["NARRATION", "SKILL", "TOOL"]),
  outcome: z.enum(["COMPLETED", "FAILED", "CANCELLED"]),
  content: z.string().min(1).max(1_000),
  toolName: z.string().min(1).max(64).nullable(),
  generationTaskId: z.string().regex(/^\d+$/).nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

export const agentCompletionCommandSchema = z.object({
  contractVersion: z.literal(2),
  creationId: z.string().regex(/^\d+$/),
  expectedRevision: z.number().int().nonnegative(),
  outcome: z.enum(["SUCCEEDED", "FAILED"]),
  failureCode: z.string().min(1).max(64).nullable(),
  finalMessage: z.string().min(1).max(8_000).nullable(),
  activities: z.array(activitySchema).max(100),
  agentContext: agentSessionContextSchema.nullable(),
}).superRefine((value, context) => {
  if (value.outcome === "SUCCEEDED" && value.finalMessage === null) {
    context.addIssue({ code: "custom", message: "A successful Agent completion requires finalMessage" });
  }
  if (value.outcome === "FAILED" && value.failureCode === null) {
    context.addIssue({ code: "custom", message: "A failed Agent completion requires failureCode" });
  }
  if (value.outcome === "SUCCEEDED" && value.agentContext === null) {
    context.addIssue({ code: "custom", message: "A successful Agent completion requires agentContext" });
  }
  if (value.outcome === "FAILED" && value.agentContext !== null) {
    context.addIssue({ code: "custom", message: "A failed Agent completion must not replace agentContext" });
  }
});

export type AgentCompletionCommand = z.infer<typeof agentCompletionCommandSchema>;

@Injectable()
export class JavaAgentCompletionClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<Environment, true>) {
    this.baseUrl = config.get("AIVISTA_JAVA_BASE_URL", { infer: true }).replace(/\/$/, "");
    this.token = config.get("AIVISTA_GENERATION_WORKER_TOKEN", { infer: true });
    this.timeoutMs = config.get("AIVISTA_JAVA_REQUEST_TIMEOUT_MS", { infer: true });
  }

  async complete(command: AgentCompletionCommand, signal?: AbortSignal): Promise<void> {
    if (!this.token) throw new Error("Generation worker token is not configured");
    const value = agentCompletionCommandSchema.parse(command);
    const url = `${this.baseUrl}/internal/generation-worker/agent-creations/${value.creationId}/completion`;
    for (let attempt = 0; attempt < 3; attempt++) {
      signal?.throwIfAborted();
      let response: Response;
      try {
        const timeout = AbortSignal.timeout(this.timeoutMs);
        response = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "X-AiVista-Worker-Token": this.token },
          body: JSON.stringify(value),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (error) {
        if (signal?.aborted || attempt === 2) throw error;
        await delay(100 * (attempt + 1), signal);
        continue;
      }
      if (response.ok) return;
      const error = new JavaGenerationApiError(response.status, undefined,
        `Java Agent completion API returned HTTP ${response.status}`);
      if (response.status < 500 || attempt === 2) throw error;
      await delay(100 * (attempt + 1), signal);
    }
  }
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); resolve(); }, milliseconds);
    const aborted = () => { clearTimeout(timer); cleanup(); reject(signal?.reason); };
    const cleanup = () => signal?.removeEventListener("abort", aborted);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}
