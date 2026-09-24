import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Environment } from "../../config/environment.js";
import { agentActivitySchema, MAX_AGENT_ACTIVITY_COUNT } from "../agent-activity.js";
import { agentSessionContextSchema } from "../agent-context.js";
import { putJavaWorker } from "../../common/java-worker-http.js";

export const MAX_AGENT_FINAL_MESSAGE_CODE_POINTS = 8_000;

const finalMessageSchema = z.string().min(1).refine(
  (value) => Array.from(value).length <= MAX_AGENT_FINAL_MESSAGE_CODE_POINTS,
  { message: "Agent final message must contain at most 8000 Unicode code points" },
);

export const agentCompletionCommandSchema = z.object({
  contractVersion: z.literal(2),
  creationId: z.string().regex(/^[1-9]\d*$/),
  expectedRevision: z.number().int().nonnegative(),
  outcome: z.enum(["SUCCEEDED", "FAILED"]),
  failureCode: z.string().min(1).max(64).nullable(),
  finalMessage: finalMessageSchema.nullable(),
  activities: z.array(agentActivitySchema).max(MAX_AGENT_ACTIVITY_COUNT),
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
