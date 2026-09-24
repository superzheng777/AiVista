import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import type { LangfuseAgent, LangfuseGeneration, LangfuseTool } from "@langfuse/tracing";
import type { AgentPromptResult, AgentRuntimeObserver } from "../agent/agent-runtime.js";

type TraceErrorReporter = (error: unknown) => void;

/** Records one Pi execution segment. All methods are fail-open for the Agent runtime. */
export class AgentTraceRecorder implements AgentRuntimeObserver {
  private generation: LangfuseGeneration | undefined;
  private readonly tools = new Map<string, LangfuseTool>();
  private generationSequence = 0;

  constructor(
    private readonly root: LangfuseAgent,
    private readonly prompt: string,
    private readonly reportError: TraceErrorReporter = () => undefined,
  ) {
    this.attempt(() => this.root.update({ input: { prompt } }));
  }

  captureSystemPrompt(systemPrompt: string): void {
    this.attempt(() => this.root.update({ input: { prompt: this.prompt, systemPrompt } }));
  }

  startGeneration(messages: unknown): void {
    this.closeGeneration("A new model call started before the previous call was closed");
    this.attempt(() => {
      this.generationSequence += 1;
      this.generation = this.root.startObservation("LLM_GENERATION", {
        input: { messages: sanitizeTraceValue(messages) },
        metadata: { sequence: this.generationSequence },
      }, { asType: "generation" });
    });
  }

  finishGeneration(message: AssistantMessage): void {
    const generation = this.generation;
    this.generation = undefined;
    if (!generation) return;

    const metadata: Record<string, unknown> = {
      provider: message.provider,
      api: message.api,
      stopReason: message.stopReason,
    };
    if (message.responseId) metadata.responseId = message.responseId;
    this.attempt(() => generation.update({
      output: { role: "assistant", content: sanitizeTraceValue(message.content) },
      model: message.responseModel ?? message.model,
      usageDetails: usageDetails(message.usage),
      metadata,
      ...(message.stopReason === "error"
        ? { level: "ERROR" as const, statusMessage: safeStatusMessage(message.errorMessage) }
        : message.stopReason === "aborted"
          ? { level: "WARNING" as const, statusMessage: "Model generation was aborted" }
          : {}),
    }));
    this.attempt(() => generation.end());
  }

  startTool(input: { toolCallId: string; toolName: string; args: unknown }): void {
    const previous = this.tools.get(input.toolCallId);
    if (previous) {
      this.closeTool(previous, "A duplicate tool call replaced this observation");
      this.tools.delete(input.toolCallId);
    }
    this.attempt(() => {
      const tool = this.root.startObservation(`TOOL:${input.toolName}`, {
        input: sanitizeTraceValue(input.args),
        metadata: { toolCallId: input.toolCallId, toolName: input.toolName },
      }, { asType: "tool" });
      this.tools.set(input.toolCallId, tool);
    });
  }

  finishTool(input: { toolCallId: string; result: unknown; isError: boolean }): void {
    const tool = this.tools.get(input.toolCallId);
    if (!tool) return;
    this.tools.delete(input.toolCallId);
    const failed = input.isError || hasFailedOutcome(input.result);
    this.attempt(() => tool.update({
      output: sanitizeTraceValue(input.result),
      ...(failed
        ? { level: "ERROR" as const, statusMessage: "Tool execution failed" }
        : {}),
    }));
    this.attempt(() => tool.end());
  }

  finishRun(result: AgentPromptResult): void {
    this.attempt(() => this.root.update({ output: result.outcome === "COMPLETED"
      ? { outcome: result.outcome, finalMessage: result.text }
      : {
        outcome: result.outcome,
        toolCallId: result.request.toolCallId,
        title: result.request.form.title,
        fieldCount: result.request.form.fields.length,
      } }));
  }

  failRun(error: unknown): void {
    const safeError = errorSummary(error);
    this.attempt(() => this.root.update({
      output: { outcome: "FAILED", error: safeError },
      level: "ERROR",
      statusMessage: safeError.message,
    }));
    this.attempt(() => this.root.otelSpan.recordException(safeError));
  }

  abortRun(): void {
    this.attempt(() => this.root.update({
      output: { outcome: "ABORTED" },
      level: "WARNING",
      statusMessage: "Agent execution was cancelled",
    }));
  }

  closeOpenObservations(): void {
    this.closeGeneration("Agent execution ended before the model call was closed");
    for (const tool of this.tools.values()) {
      this.closeTool(tool, "Agent execution ended before the tool call was closed");
    }
    this.tools.clear();
  }

  private closeGeneration(statusMessage: string): void {
    const generation = this.generation;
    this.generation = undefined;
    if (!generation) return;
    this.attempt(() => generation.update({ level: "WARNING", statusMessage }));
    this.attempt(() => generation.end());
  }

  private closeTool(tool: LangfuseTool, statusMessage: string): void {
    this.attempt(() => tool.update({ level: "WARNING", statusMessage }));
    this.attempt(() => tool.end());
  }

  private attempt(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      try { this.reportError(error); } catch { /* Observability must remain fail-open. */ }
    }
  }
}

function sanitizeTraceValue(value: unknown): unknown {
  return sanitize(value, new WeakSet<object>());
}

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) return errorSummary(value);
  if (value instanceof Uint8Array) {
    return { type: "binary", byteLength: value.byteLength, omitted: true };
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));

  const record = value as Record<string, unknown>;
  if (record.type === "image" && typeof record.data === "string") {
    return {
      type: "image",
      ...(typeof record.mimeType === "string" ? { mimeType: record.mimeType } : {}),
      ...(typeof record.assetId === "string" ? { assetId: record.assetId } : {}),
      omitted: true,
    };
  }
  if (record.type === "thinking") {
    return { type: "thinking", omitted: true };
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (key === "thoughtSignature" || key === "thinkingSignature") continue;
    sanitized[key] = sanitize(entry, seen);
  }
  return sanitized;
}

function usageDetails(usage: Usage): Record<string, number> {
  const reasoning = Math.min(usage.output, Math.max(0, usage.reasoning ?? 0));
  return {
    input: usage.input,
    output: Math.max(0, usage.output - reasoning),
    total: usage.totalTokens,
    ...(usage.cacheRead > 0 ? { cache_read_input_tokens: usage.cacheRead } : {}),
    ...(usage.cacheWrite > 0 ? { cache_creation_input_tokens: usage.cacheWrite } : {}),
    ...(reasoning > 0 ? { output_reasoning_tokens: reasoning } : {}),
  };
}

function errorSummary(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "Error", message: typeof error === "string" ? error : "Unknown Agent error" };
}

function safeStatusMessage(message: string | undefined): string {
  return message?.slice(0, 1_000) || "Model generation failed";
}

function hasFailedOutcome(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const details = Reflect.get(result, "details");
  return details !== null
    && typeof details === "object"
    && Reflect.get(details, "outcome") === "FAILED";
}
