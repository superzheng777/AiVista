import { registerFauxProvider } from "@earendil-works/pi-ai/compat";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { defineTool, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import {
  runAgentPrompt,
  type AgentRuntimeEvent,
} from "../src/agent/agent-runtime.js";
import type { AgentModelBinding } from "../src/agent/providers/bailian.js";
import { createGenerationTools, createInspectImageTool,
  createRequestUserInputTool, type GenerationToolRequest } from "../src/agent/tools/index.js";

const cleanup: Array<() => void> = [];

afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
});

describe("Agent runtime", () => {
  it("runs one in-memory Pi loop and projects native lifecycle and text events", async () => {
    const { binding, faux } = await createFauxBinding();
    faux.setResponses([fauxAssistantMessage("你好，我是 AiVista。")]);
    const events: AgentRuntimeEvent[] = [];

    const result = await runAgentPrompt({
      binding,
      prompt: "你好",
      maxTurns: 20,
      onEvent: (event) => events.push(event),
    });

    expect(result).toMatchObject({ outcome: "COMPLETED", text: "你好，我是 AiVista。" });
    expect(result.context).toMatchObject({ schemaVersion: 1, compaction: null });
    expect(events[0]).toEqual({ type: "agent_start" });
    expect(events).toContainEqual({ type: "turn_start", turn: 1 });
    expect(events).toContainEqual({ type: "text_end", contentIndex: 0, text: "你好，我是 AiVista。" });
  });

  it("rejects a turn budget outside the configured product limit", async () => {
    const { binding } = await createFauxBinding();

    await expect(runAgentPrompt({ binding, prompt: "你好", maxTurns: 21 }))
      .rejects.toThrow("maxTurns must be an integer between 1 and 20");
  });

  it("restores the persisted Pi context into the request-scoped session with original roles", async () => {
    const { binding, faux } = await createFauxBinding();
    let rolesAndText: string[] = [];
    faux.setResponses([(context) => {
      rolesAndText = context.messages.map((message) => {
        const text = typeof message.content === "string" ? message.content
          : message.content.filter((item) => item.type === "text").map((item) => item.text).join("");
        return `${message.role}:${text}`;
      });
      return fauxAssistantMessage("继续创作。");
    }]);

    await runAgentPrompt({ binding, prompt: "把标题改成秋日特饮", maxTurns: 20, context: {
      schemaVersion: 1,
      compaction: null,
      messages: [
        { role: "user", content: "制作一张饮品海报", timestamp: Date.now() },
        fauxAssistantMessage("海报已经生成。"),
      ],
    } });

    expect(rolesAndText).toEqual([
      "user:制作一张饮品海报", "assistant:海报已经生成。", "user:把标题改成秋日特饮",
    ]);
  });

  it("binds injected images to their authorized Asset IDs in per-run system context", async () => {
    const { binding, faux } = await createFauxBinding();
    let systemPrompt = "";
    faux.setResponses([(context) => {
      systemPrompt = context.systemPrompt ?? "";
      return fauxAssistantMessage("已识别参考图片。");
    }]);

    await runAgentPrompt({
      binding,
      prompt: "修改参考图片",
      maxTurns: 20,
      authorizedInputAssetIds: ["101", "202"],
      generationConstraints: { aspectRatio: "3:4", imageCount: 3 },
    });

    expect(systemPrompt).toContain("图片 1：Asset ID 101");
    expect(systemPrompt).toContain("图片 2：Asset ID 202");
    expect(systemPrompt).toContain("inputAssetIds 只能从上述 ID 中选择");
    expect(systemPrompt).toContain("固定为 3:4");
    expect(systemPrompt).toContain("本轮最终目标为 3 张");
    expect(systemPrompt).toContain("inspect_image");
  });

  it("feeds the formal generation Tool Result into the next Pi turn", async () => {
    const { binding, faux } = await createFauxBinding();
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("text_to_image", {
        userFacingPlan: "我会采用清爽明亮的夏日配色和竖版构图，突出饮品主体。",
        prompt: "夏日饮品海报",
        aspectRatio: "3:4",
        imageCount: 1,
      }), { stopReason: "toolUse" }),
      fauxAssistantMessage("海报已经生成。"),
    ]);
    const requests: GenerationToolRequest[] = [];
    const events: AgentRuntimeEvent[] = [];
    const tools = createGenerationTools({
      constraints: { aspectRatio: "AUTO", imageCount: 0 },
      authorizedInputAssetIds: new Set(),
      executor: {
        async execute(_toolCallId, request) {
          requests.push(request);
          return { outcome: "SUCCEEDED", generationTaskId: "9001", imageAssetIds: ["7001"] };
        },
      },
    });

    const result = await runAgentPrompt({
      binding,
      prompt: "生成一张夏日饮品海报",
      maxTurns: 20,
      tools,
      onEvent: (event) => events.push(event),
    });

    expect(result.outcome).toBe("COMPLETED");
    if (result.outcome !== "COMPLETED") throw new Error("expected a completed run");
    expect(result.text).toBe("海报已经生成。");
    expect(requests).toHaveLength(1);
    expect(events).toContainEqual(expect.objectContaining({
      type: "tool_start", toolName: "text_to_image",
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: "tool_end", toolName: "text_to_image", isError: false,
    }));
    expect(requests[0]).toMatchObject({
      operation: "TEXT_TO_IMAGE",
      promptExtend: true,
      imageCount: 1,
    });
  });

  it("feeds inspected ImageContent into the next turn but exports only its Asset ID", async () => {
    const { binding, faux } = await createFauxBinding();
    let nextTurnSawImage = false;
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("inspect_image", { assetId: "701" }), { stopReason: "toolUse" }),
      (context) => {
        const result = context.messages.findLast((message) => message.role === "toolResult");
        nextTurnSawImage = result?.role === "toolResult"
          && result.content.some((item) => item.type === "image" && item.data === "AQI=");
        return fauxAssistantMessage("我已理解这张历史图片。");
      },
    ]);
    const tool = createInspectImageTool({ inspect: async (assetId) => ({ assetId,
      image: { type: "image", data: "AQI=", mimeType: "image/webp" } }) });

    const result = await runAgentPrompt({ binding, prompt: "看看上一张图片", maxTurns: 20, tools: [tool] });

    expect(nextTurnSawImage).toBe(true);
    expect(JSON.stringify(result.context)).toContain("Asset ID: 701");
    expect(JSON.stringify(result.context)).not.toContain("AQI=");
  });

  it("feeds an actionable failed Tool Result back so the model can correct the next call", async () => {
    const { binding, faux } = await createFauxBinding();
    let correctionContext = "";
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("image_to_image", {
        userFacingPlan: "我会保留参考图构图，将整体色调调整为温暖的橙色。",
        prompt: "改成暖橙色",
        aspectRatio: "3:4",
        imageCount: 1,
        inputAssetIds: ["999"],
      }), { stopReason: "toolUse" }),
      (context) => {
        correctionContext = JSON.stringify(context.messages);
        return fauxAssistantMessage(fauxToolCall("image_to_image", {
          userFacingPlan: "我会使用已授权的参考图，继续完成暖橙色方向的调整。",
          prompt: "改成暖橙色",
          aspectRatio: "3:4",
          imageCount: 1,
          inputAssetIds: ["101"],
        }), { stopReason: "toolUse" });
      },
      fauxAssistantMessage("已使用获授权的参考图重新生成。"),
    ]);
    const requests: GenerationToolRequest[] = [];
    const tools = createGenerationTools({
      constraints: { aspectRatio: "AUTO", imageCount: 0 },
      authorizedInputAssetIds: new Set(["101"]),
      executor: {
        async execute(_toolCallId, request) {
          requests.push(request);
          return { outcome: "SUCCEEDED", generationTaskId: "9002", imageAssetIds: ["7002"] };
        },
      },
    });

    const result = await runAgentPrompt({ binding, prompt: "修改参考图", maxTurns: 20,
      tools, authorizedInputAssetIds: ["101"] });

    expect(correctionContext).toContain("INPUT_ASSET_NOT_AUTHORIZED");
    expect(correctionContext).toContain("本轮允许的图片资产 ID：101");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.inputAssetIds).toEqual(["101"]);
    expect(result).toMatchObject({ outcome: "COMPLETED", text: "已使用获授权的参考图重新生成。" });
  });

  it("persists the form Tool Result and settles without a second model call", async () => {
    const { binding, faux } = await createFauxBinding();
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("request_user_input", {
        title: "电影感摄影图定制",
        fields: [{ id: "story", type: "TEXT", label: "主题或故事", required: true,
          initialValue: "深夜车站，等不到末班车的人" }],
      }), { stopReason: "toolUse" }),
    ]);
    let settledCount = 0;

    const result = await runAgentPrompt({ binding, prompt: "帮我生成电影剧照", maxTurns: 20,
      tools: [createRequestUserInputTool()], onEvent: (event) => {
        if (event.type === "agent_start") settledCount += 1;
      } });

    expect(result).toMatchObject({
      outcome: "WAITING_FOR_USER",
      request: { form: { schemaVersion: 1, title: "电影感摄影图定制" } },
    });
    expect(faux.state.callCount).toBe(1);
    expect(settledCount).toBe(1);
    expect(result.context.messages.at(-1)).toMatchObject({
      role: "toolResult", toolName: "request_user_input", isError: false,
      details: { outcome: "WAITING_FOR_USER" },
    });
  });

  it("blocks every tool in a mixed form batch before any side effect runs", async () => {
    const { binding, faux } = await createFauxBinding();
    faux.setResponses([
      fauxAssistantMessage([
        fauxToolCall("request_user_input", {
          title: "确认海报信息",
          fields: [{ id: "theme", type: "TEXT", label: "主题", required: true }],
        }),
        fauxToolCall("text_to_image", {
          userFacingPlan: "先生成图片。", prompt: "测试", aspectRatio: "1:1", imageCount: 1,
        }),
      ], { stopReason: "toolUse" }),
      fauxAssistantMessage(fauxToolCall("request_user_input", {
        title: "确认海报信息",
        fields: [{ id: "theme", type: "TEXT", label: "主题", required: true }],
      }), { stopReason: "toolUse" }),
    ]);
    let generationCalls = 0;
    const events: AgentRuntimeEvent[] = [];
    const tools = [createRequestUserInputTool(), ...createGenerationTools({
      constraints: { aspectRatio: "AUTO", imageCount: 0 },
      authorizedInputAssetIds: new Set(),
      executor: { async execute() {
        generationCalls += 1;
        return { outcome: "SUCCEEDED" as const, generationTaskId: "1", imageAssetIds: ["2"] };
      } },
    })];

    const result = await runAgentPrompt({ binding, prompt: "做海报", maxTurns: 20, tools,
      onEvent: (event) => events.push(event) });

    expect(generationCalls).toBe(0);
    expect(events.filter((event) => event.type === "tool_start" || event.type === "tool_end"))
      .toEqual([
        expect.objectContaining({ type: "tool_start", toolName: "request_user_input" }),
        expect.objectContaining({ type: "tool_end", toolName: "request_user_input" }),
      ]);
    expect(faux.state.callCount).toBe(2);
    expect(result).toMatchObject({ outcome: "WAITING_FOR_USER" });
  });

  it("resumes a paused form context with a new user response", async () => {
    const first = await createFauxBinding();
    first.faux.setResponses([fauxAssistantMessage(fauxToolCall("request_user_input", {
      title: "确认海报信息",
      fields: [{ id: "theme", type: "TEXT", label: "主题", required: true }],
    }), { stopReason: "toolUse" })]);
    const paused = await runAgentPrompt({ binding: first.binding, prompt: "做一张海报", maxTurns: 20,
      tools: [createRequestUserInputTool()] });
    expect(paused.outcome).toBe("WAITING_FOR_USER");

    first.faux.setResponses([(context) => {
      expect(context.messages.map((message) => message.role)).toEqual([
        "user", "assistant", "toolResult", "user",
      ]);
      return fauxAssistantMessage("信息已确认，继续创作。");
    }]);
    const resumed = await runAgentPrompt({ binding: first.binding,
      prompt: "[用户创作需求表单响应]\n主题：关爱动物", maxTurns: 20,
      context: paused.context, tools: [createRequestUserInputTool()] });

    expect(resumed).toMatchObject({ outcome: "COMPLETED", text: "信息已确认，继续创作。" });
  });

  it("aborts without completing a turn beyond the twentieth", async () => {
    const { binding, faux } = await createFauxBinding();
    faux.setResponses(Array.from({ length: 20 }, () =>
      fauxAssistantMessage(fauxToolCall("continue_test", {}), { stopReason: "toolUse" })));
    let calls = 0;
    const tool = defineTool({
      name: "continue_test",
      label: "Continue test",
      description: "Continue the local turn-limit test.",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        calls += 1;
        return { content: [{ type: "text" as const, text: "continue" }], details: {} };
      },
    });
    const turns: number[] = [];

    await expect(runAgentPrompt({
      binding,
      prompt: "continue",
      maxTurns: 20,
      tools: [tool],
      onEvent: (event) => {
        if (event.type === "turn_start") turns.push(event.turn);
      },
    })).rejects.toMatchObject({ name: "AgentTurnLimitError", maxTurns: 20 });
    expect(calls).toBe(20);
    expect(turns).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it("awaits Pi cancellation and propagates the Tool AbortSignal", async () => {
    const { binding, faux } = await createFauxBinding();
    faux.setResponses([fauxAssistantMessage(fauxToolCall("wait_for_cancel", {}), { stopReason: "toolUse" })]);
    const controller = new AbortController();
    let toolStarted!: () => void;
    const started = new Promise<void>((resolve) => { toolStarted = resolve; });
    let toolSignalAborted = false;
    const tool = defineTool({
      name: "wait_for_cancel",
      label: "Wait for cancel",
      description: "Wait until the runtime cancellation test aborts this Tool.",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute(_toolCallId, _params, signal) {
        toolStarted();
        await new Promise<void>((_resolve, reject) => signal!.addEventListener("abort", () => {
          toolSignalAborted = true;
          reject(new DOMException("cancelled", "AbortError"));
        }, { once: true }));
        return { content: [{ type: "text" as const, text: "unreachable" }], details: {} };
      },
    });

    const run = runAgentPrompt({ binding, prompt: "等待取消", maxTurns: 20, tools: [tool],
      signal: controller.signal });
    await started;
    controller.abort();

    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(toolSignalAborted).toBe(true);
  });
});

async function createFauxBinding(): Promise<{
  binding: AgentModelBinding;
  faux: ReturnType<typeof registerFauxProvider>;
}> {
  const faux = registerFauxProvider();
  cleanup.push(() => faux.unregister());
  const model = faux.getModel();
  const modelRuntime = await ModelRuntime.create({ modelsPath: null, allowModelNetwork: false });
  modelRuntime.registerProvider(model.provider, {
    baseUrl: model.baseUrl,
    apiKey: "faux-key",
    api: faux.api,
    models: [{
      id: model.id,
      name: model.name,
      api: model.api,
      reasoning: model.reasoning,
      input: model.input,
      cost: model.cost,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      baseUrl: model.baseUrl,
    }],
  });
  const registered = modelRuntime.getModel(model.provider, model.id);
  if (!registered) throw new Error("Faux model registration failed");
  return { binding: { modelRuntime, model: registered }, faux };
}
