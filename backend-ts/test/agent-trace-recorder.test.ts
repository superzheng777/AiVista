import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { AgentTraceRecorder } from "../src/observability/agent-trace-recorder.js";

describe("AgentTraceRecorder", () => {
  it("records the prompt, system prompt, and sanitized messages without image or thinking payloads", () => {
    const root = new FakeObservation("AGENT_RUN", "agent");
    const recorder = new AgentTraceRecorder(root as never, "生成一张海报");

    recorder.captureSystemPrompt("你是 AiVista 创作 Agent。");
    recorder.startGeneration([
      { role: "user", content: [
        { type: "text", text: "参考这张图片" },
        { type: "image", data: "user-image-base64", mimeType: "image/webp" },
      ] },
      { role: "assistant", content: [
        { type: "thinking", thinking: "private reasoning", thinkingSignature: "thinking-secret" },
        { type: "toolCall", id: "call-1", name: "inspect_image", arguments: { assetId: "701" },
          thoughtSignature: "tool-signature-secret" },
      ] },
    ]);
    recorder.finishGeneration(assistantMessage({
      content: [
        { type: "thinking", thinking: "hidden output", thinkingSignature: "output-thinking-secret" },
        { type: "toolCall", id: "call-2", name: "inspect_image", arguments: { assetId: "702" },
          thoughtSignature: "output-tool-secret" },
      ],
    }));

    expect(root.updates).toEqual([
      { input: { prompt: "生成一张海报" } },
      { input: { prompt: "生成一张海报", systemPrompt: "你是 AiVista 创作 Agent。" } },
    ]);
    const generation = root.children[0]!;
    expect(generation).toMatchObject({ name: "LLM_GENERATION", type: "generation" });
    expect(generation.initialAttributes).toMatchObject({
      input: { messages: [
        { role: "user", content: [
          { type: "text", text: "参考这张图片" },
          { type: "image", mimeType: "image/webp", omitted: true },
        ] },
        { role: "assistant", content: [
          { type: "thinking", omitted: true },
          { type: "toolCall", id: "call-1", name: "inspect_image", arguments: { assetId: "701" } },
        ] },
      ] },
      metadata: { sequence: 1 },
    });
    expect(generation.updates[0]).toMatchObject({ output: { role: "assistant", content: [
      { type: "thinking", omitted: true },
      { type: "toolCall", id: "call-2", name: "inspect_image", arguments: { assetId: "702" } },
    ] } });
    expect(JSON.stringify({ input: generation.initialAttributes, output: generation.updates }))
      .not.toMatch(/user-image-base64|private reasoning|hidden output|thinking-secret|tool-signature-secret/);
  });

  it("maps Pi token usage without sending Pi cost details", () => {
    const root = new FakeObservation("AGENT_RUN", "agent");
    const recorder = new AgentTraceRecorder(root as never, "你好");

    recorder.startGeneration([{ role: "user", content: "你好" }]);
    recorder.finishGeneration(assistantMessage({
      responseModel: "qwen-response-model",
      responseId: "response-1",
      usage: {
        input: 100,
        output: 25,
        reasoning: 5,
        cacheRead: 10,
        cacheWrite: 4,
        totalTokens: 125,
        cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
      },
    }));

    const update = root.children[0]!.updates[0] as Record<string, unknown>;
    expect(update).toMatchObject({
      model: "qwen-response-model",
      usageDetails: {
        input: 100,
        output: 20,
        total: 125,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 4,
        output_reasoning_tokens: 5,
      },
      metadata: { provider: "test-provider", api: "openai-completions", stopReason: "stop",
        responseId: "response-1" },
    });
    expect(update).not.toHaveProperty("costDetails");
    expect(JSON.stringify(update)).not.toContain('"cost"');
  });

  it("matches parallel tools by toolCallId when they finish in reverse order", () => {
    const root = new FakeObservation("AGENT_RUN", "agent");
    const recorder = new AgentTraceRecorder(root as never, "并行生成");

    recorder.startTool({ toolCallId: "call-a", toolName: "text_to_image", args: { prompt: "A" } });
    recorder.startTool({ toolCallId: "call-b", toolName: "inspect_image", args: { assetId: "701" } });
    recorder.finishTool({ toolCallId: "call-b", isError: false, result: { content: [
      { type: "image", data: "tool-image-base64", mimeType: "image/png" },
    ], details: { assetId: "701" } } });
    recorder.finishTool({ toolCallId: "call-a", isError: false,
      result: { details: { generationTaskId: "901" } } });

    const toolA = root.children.find((child) => child.name === "TOOL:text_to_image")!;
    const toolB = root.children.find((child) => child.name === "TOOL:inspect_image")!;
    expect(toolA.updates[0]).toEqual({ output: { details: { generationTaskId: "901" } } });
    expect(toolB.updates[0]).toEqual({ output: { content: [
      { type: "image", mimeType: "image/png", omitted: true },
    ], details: { assetId: "701" } } });
    expect(JSON.stringify(toolB.updates)).not.toContain("tool-image-base64");
    expect(toolA.end).toHaveBeenCalledTimes(1);
    expect(toolB.end).toHaveBeenCalledTimes(1);
  });

  it("marks a business-level Tool failure as an error observation", () => {
    const root = new FakeObservation("AGENT_RUN", "agent");
    const recorder = new AgentTraceRecorder(root as never, "生成图片");

    recorder.startTool({ toolCallId: "call-failed", toolName: "text_to_image", args: {} });
    recorder.finishTool({ toolCallId: "call-failed", isError: false,
      result: { details: { outcome: "FAILED", code: "GENERATION_FAILED" } } });

    expect(root.children[0]!.updates[0]).toEqual({
      output: { details: { outcome: "FAILED", code: "GENERATION_FAILED" } },
      level: "ERROR",
      statusMessage: "Tool execution failed",
    });
  });

  it("keeps identical toolCallIds isolated between recorder instances", () => {
    const firstRoot = new FakeObservation("AGENT_RUN", "agent");
    const secondRoot = new FakeObservation("AGENT_RUN", "agent");
    const first = new AgentTraceRecorder(firstRoot as never, "任务 A");
    const second = new AgentTraceRecorder(secondRoot as never, "任务 B");

    first.startTool({ toolCallId: "shared-call", toolName: "text_to_image", args: { prompt: "A" } });
    second.startTool({ toolCallId: "shared-call", toolName: "text_to_image", args: { prompt: "B" } });
    second.finishTool({ toolCallId: "shared-call", result: { task: "B" }, isError: false });

    expect(firstRoot.children[0]!.end).not.toHaveBeenCalled();
    expect(secondRoot.children[0]!.updates[0]).toEqual({ output: { task: "B" } });
    first.finishTool({ toolCallId: "shared-call", result: { task: "A" }, isError: false });
    expect(firstRoot.children[0]!.updates[0]).toEqual({ output: { task: "A" } });
    expect(firstRoot.children[0]!.end).toHaveBeenCalledTimes(1);
    expect(secondRoot.children[0]!.end).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["COMPLETED", { outcome: "COMPLETED" as const, text: "创作完成。", context: agentContext() },
      { outcome: "COMPLETED", finalMessage: "创作完成。" }],
    ["WAITING_FOR_USER", { outcome: "WAITING_FOR_USER" as const, request: {
      toolCallId: "call-form", form: { schemaVersion: 2 as const, title: "确认创作方向", fields: [
        { id: "theme", type: "TEXT" as const, label: "主题", required: true, value: "" },
        { id: "style", type: "TEXT" as const, label: "风格", required: true, value: "" },
      ] },
    }, context: agentContext() },
    { outcome: "WAITING_FOR_USER", toolCallId: "call-form", title: "确认创作方向", fieldCount: 2 }],
  ])("records a compact %s root output", (_name, result, output) => {
    const root = new FakeObservation("AGENT_RUN", "agent");
    const recorder = new AgentTraceRecorder(root as never, "创作");

    recorder.finishRun(result);

    expect(root.updates.at(-1)).toEqual({ output });
  });

  it("records only a safe error summary and closes every open observation once", () => {
    const root = new FakeObservation("AGENT_RUN", "agent");
    const recorder = new AgentTraceRecorder(root as never, "创作");
    recorder.startGeneration([{ role: "user", content: "开始" }]);
    recorder.startTool({ toolCallId: "call-open", toolName: "text_to_image", args: {} });
    const error = Object.assign(new TypeError("provider failed"), {
      request: { headers: { authorization: "Bearer secret-token" } },
    });

    recorder.failRun(error);
    recorder.closeOpenObservations();
    recorder.closeOpenObservations();

    expect(root.updates.at(-1)).toEqual({
      output: { outcome: "FAILED", error: { name: "TypeError", message: "provider failed" } },
      level: "ERROR",
      statusMessage: "provider failed",
    });
    expect(root.otelSpan.recordException).toHaveBeenCalledWith({
      name: "TypeError", message: "provider failed",
    });
    expect(JSON.stringify(root.updates)).not.toContain("secret-token");
    for (const child of root.children) {
      expect(child.updates.at(-1)).toMatchObject({ level: "WARNING" });
      expect(child.end).toHaveBeenCalledTimes(1);
    }
  });

  it("records cancellation as an aborted warning rather than a failed run", () => {
    const root = new FakeObservation("AGENT_RUN", "agent");
    const recorder = new AgentTraceRecorder(root as never, "创作");

    recorder.abortRun();

    expect(root.updates.at(-1)).toEqual({
      output: { outcome: "ABORTED" },
      level: "WARNING",
      statusMessage: "Agent execution was cancelled",
    });
    expect(root.otelSpan.recordException).not.toHaveBeenCalled();
  });

  it("never lets observation or error-reporter failures escape into the Agent runtime", () => {
    const failure = new Error("telemetry unavailable");
    const child = {
      update: vi.fn(() => { throw failure; }),
      end: vi.fn(() => { throw failure; }),
    };
    const root = {
      update: vi.fn(() => { throw failure; }),
      startObservation: vi.fn(() => child),
      otelSpan: { recordException: vi.fn(() => { throw failure; }) },
    };
    const reportError = vi.fn(() => { throw new Error("logger unavailable"); });

    expect(() => {
      const recorder = new AgentTraceRecorder(root as never, "创作", reportError);
      recorder.captureSystemPrompt("system");
      recorder.startGeneration([]);
      recorder.finishGeneration(assistantMessage());
      recorder.startTool({ toolCallId: "call-1", toolName: "read", args: {} });
      recorder.finishTool({ toolCallId: "call-1", result: {}, isError: true });
      recorder.finishRun({ outcome: "COMPLETED", text: "完成", context: agentContext() });
      recorder.failRun(failure);
      recorder.closeOpenObservations();
    }).not.toThrow();
    expect(reportError).toHaveBeenCalled();
  });
});

class FakeObservation {
  readonly updates: unknown[] = [];
  readonly children: FakeObservation[] = [];
  readonly otelSpan = { recordException: vi.fn() };
  readonly update = vi.fn((attributes: unknown) => {
    this.updates.push(attributes);
    return this;
  });
  readonly end = vi.fn();
  readonly startObservation = vi.fn((name: string, attributes: unknown,
      options: { asType: "generation" | "tool" }) => {
    const child = new FakeObservation(name, options.asType, attributes);
    this.children.push(child);
    return child;
  });

  constructor(
    readonly name: string,
    readonly type: "agent" | "generation" | "tool",
    readonly initialAttributes?: unknown,
  ) {}
}

function assistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "完成" }],
    api: "openai-completions",
    provider: "test-provider",
    model: "qwen-test",
    usage: {
      input: 10,
      output: 6,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 16,
      cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, total: 3 },
    },
    stopReason: "stop",
    timestamp: 1,
    ...overrides,
  };
}

function agentContext() {
  return { schemaVersion: 1 as const, compaction: null, messages: [] };
}
