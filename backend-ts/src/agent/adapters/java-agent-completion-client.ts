import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Environment } from "../../config/environment.js";
import { agentSessionContextSchema } from "../agent-context.js";
import { putJavaWorker } from "../../common/java-worker-http.js";

export const activitySchema = z.object({
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
    await putJavaWorker({ url, token: this.token, body: value, timeoutMs: this.timeoutMs, signal,
      fallbackError: "Java Agent completion API request failed" });
  }
}
