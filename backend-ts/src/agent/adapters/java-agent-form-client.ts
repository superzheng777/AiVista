import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Environment } from "../../config/environment.js";
import { agentInputFormSchema } from "../agent-form-contract.js";
import { activitySchema } from "./java-agent-completion-client.js";
import { putJavaWorker } from "../../common/java-worker-http.js";

export const agentInputRequestCommandSchema = z.object({
  contractVersion: z.literal(1),
  expectedRevision: z.number().int().nonnegative(),
  form: agentInputFormSchema,
  activities: z.array(activitySchema).max(100),
});

export type AgentInputRequestCommand = z.infer<typeof agentInputRequestCommandSchema>;

@Injectable()
export class JavaAgentFormClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<Environment, true>) {
    this.baseUrl = config.get("AIVISTA_JAVA_BASE_URL", { infer: true }).replace(/\/$/, "");
    this.token = config.get("AIVISTA_GENERATION_WORKER_TOKEN", { infer: true });
    this.timeoutMs = config.get("AIVISTA_JAVA_REQUEST_TIMEOUT_MS", { infer: true });
  }

  async request(creationId: string, toolCallId: string, command: AgentInputRequestCommand,
      signal?: AbortSignal): Promise<void> {
    if (!this.token) throw new Error("Generation worker token is not configured");
    if (!/^[1-9]\d*$/.test(creationId)) throw new TypeError("creationId must be a positive integer ID");
    if (!toolCallId || toolCallId.length > 128) throw new TypeError("toolCallId must contain 1 to 128 characters");
    const value = agentInputRequestCommandSchema.parse(command);
    const url = `${this.baseUrl}/internal/generation-worker/agent-creations/${creationId}`
      + `/forms/${encodeURIComponent(toolCallId)}`;
    await putJavaWorker({ url, token: this.token, body: value, timeoutMs: this.timeoutMs, signal,
      fallbackError: "Java Agent form API request failed" });
  }
}
