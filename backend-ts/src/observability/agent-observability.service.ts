import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { AgentPromptResult } from "../agent/agent-runtime.js";
import type { Environment } from "../config/environment.js";
import { AgentTraceRecorder } from "./agent-trace-recorder.js";

export interface AgentRunTraceContext {
  sessionId: string;
  creationId: string;
  revision: number;
  resumed: boolean;
  prompt: string;
  signal?: AbortSignal;
}

@Injectable()
export class AgentObservabilityService implements OnApplicationShutdown {
  private readonly logger = new Logger(AgentObservabilityService.name);
  private provider: NodeTracerProvider | undefined;
  private startup: Promise<boolean> | undefined;

  constructor(private readonly config: ConfigService<Environment, true>) {}

  async traceAgentRun(
    context: AgentRunTraceContext,
    execute: (recorder: AgentTraceRecorder | undefined) => Promise<AgentPromptResult>,
  ): Promise<AgentPromptResult> {
    if (!this.config.get("AIVISTA_LANGFUSE_ENABLED", { infer: true }) || !await this.ensureStarted()) {
      return execute(undefined);
    }

    let executeStarted = false;
    let executeCompleted = false;
    let executeFailed = false;
    let result!: AgentPromptResult;
    let executionError: unknown;
    try {
      return await propagateAttributes({
        traceName: "AGENT_RUN",
        sessionId: context.sessionId,
        tags: ["aivista-agent", context.resumed ? "resumed" : "initial"],
        metadata: {
          creationId: context.creationId,
          revision: String(context.revision),
          resumed: String(context.resumed),
        },
      }, () => startActiveObservation("AGENT_RUN", async (root) => {
        const recorder = new AgentTraceRecorder(root, context.prompt,
          (error) => this.warn("Agent trace recording failed", error));
        executeStarted = true;
        try {
          result = await execute(recorder);
          executeCompleted = true;
          recorder.finishRun(result);
          return result;
        } catch (error) {
          executeFailed = true;
          executionError = error;
          if (isCancellation(error, context.signal)) recorder.abortRun();
          else recorder.failRun(error);
          throw error;
        } finally {
          recorder.closeOpenObservations();
        }
      }, { asType: "agent" }));
    } catch (error) {
      if (executeFailed) throw executionError;
      if (executeCompleted) {
        this.warn("Agent trace finalization failed", error);
        return result;
      }
      if (executeStarted) throw error;
      this.warn("Agent trace creation failed; running without observability", error);
      return execute(undefined);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.startup) await this.startup;
    const provider = this.provider;
    this.provider = undefined;
    if (!provider) return;
    try {
      await provider.shutdown();
    } catch (error) {
      this.warn("Langfuse shutdown failed", error);
    }
  }

  private ensureStarted(): Promise<boolean> {
    this.startup ??= this.start();
    return this.startup;
  }

  private async start(): Promise<boolean> {
    let processor: LangfuseSpanProcessor | undefined;
    try {
      const publicKey = this.config.get("LANGFUSE_PUBLIC_KEY", { infer: true });
      const secretKey = this.config.get("LANGFUSE_SECRET_KEY", { infer: true });
      if (!publicKey || !secretKey) throw new Error("Langfuse keys are missing");
      processor = new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        baseUrl: this.config.get("LANGFUSE_BASE_URL", { infer: true }).replace(/\/+$/, ""),
        exportMode: "batched",
        mediaUploadEnabled: false,
      });
      const provider = new NodeTracerProvider({ spanProcessors: [processor] });
      provider.register();
      this.provider = provider;
      return true;
    } catch (error) {
      if (processor) {
        try { await processor.shutdown(); } catch { /* Preserve the original startup failure. */ }
      }
      this.warn("Langfuse initialization failed; observability is disabled", error);
      return false;
    }
  }

  private warn(message: string, error: unknown): void {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
    this.logger.warn(`${message}: ${detail}`);
  }
}

function isCancellation(error: unknown, signal: AbortSignal | undefined): boolean {
  const reason = signal?.reason;
  if (errorName(error) === "TimeoutError" || errorName(reason) === "TimeoutError") return false;
  return signal?.aborted === true
    || errorName(error) === "AbortError"
    || error === "USER_CANCELLED"
    || error === "AUTHORITATIVE_STATE_CHANGED";
}

function errorName(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("name" in error)) return undefined;
  return typeof error.name === "string" ? error.name : undefined;
}
