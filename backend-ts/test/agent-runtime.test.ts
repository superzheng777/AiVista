import { registerFauxProvider } from "@earendil-works/pi-ai/compat";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { defineTool, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runAgentPrompt,
  type AgentRuntimeEvent,
} from "../src/agent/agent-runtime.js";
import { createAgentModelBinding, type AgentModelBinding } from "../src/agent/providers/bailian.js";
import { createGenerationTools, createInspectImageTool,
  createRequestUserInputTool, type GenerationToolRequest } from "../src/agent/tools/index.js";
import { CREATION_STARTED, FORM_ANSWER } from "../src/sessions/session-store.js";
import { projectSession } from "../src/sessions/session-projector.js";
import type { CreationItem } from "../src/sessions/session-contract.js";
import { runNormalGeneration } from "../src/sessions/normal-generation.js";
import { injectModelImages } from "../src/sessions/model-images.js";

const cleanup: Array<() => void> = [];

afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
  vi.unstubAllGlobals();
});

describe("Agent runtime", () => {
  it("projects the same ordered text and tool items from live events and native history", async () => {
    const { binding, faux } = await createFauxBinding();
    const manager = SessionManager.inMemory();
    manager.appendCustomEntry(CREATION_STARTED, { creationId: "20", mode: "AGENT", input: { prompt: "生成海报", assets: [] }, settings: {} });
    faux.setResponses([
      fauxAssistantMessage([{ type: "text", text: "开始生成" }, fauxToolCall("text_to_image", {
        prompt: "咖啡海报", aspectRatio: "1:1", imageCount: 1,
      }, { id: "image-call" })], { timestamp: 10, stopReason: "toolUse" }),
      fauxAssistantMessage("海报已完成", { timestamp: 20 }),
    ]);
    const live = new Map<string, CreationItem>();
    const tools = createGenerationTools({ authorizedInputAssetIds: new Set(), constraints: { aspectRatio: "AUTO", imageCount: 1 },
      executor: { execute: async () => ({ generationId: "21", status: "SUCCEEDED", assets: [{ assetId: "31", url: "https://oss.example/31.png" }] }) } });
    await runAgentPrompt({ binding, sessionManager: manager, prompt: "生成海报", maxTurns: 4, tools, onItem: (item) => {
      if (item.kind === "tool") {
        expect(item).not.toHaveProperty("arguments");
        expect(item).not.toHaveProperty("result");
        expect(JSON.stringify(item)).not.toContain("咖啡海报");
      }
      live.set(item.id, item);
    } });
    expect([...live.values()].filter((item) => item.kind === "text" || item.kind === "tool"))
      .toMatchObject([
        { kind: "text", assistantMessageId: "assistant:10" },
        { kind: "tool", assistantMessageId: "assistant:10", status: "SUCCEEDED" },
        { kind: "text", assistantMessageId: "assistant:20" },
      ]);
    const state = { creationId: "20", status: "RUNNING" as const, revision: 1, completedAt: null, failureCode: null };
    expect([...live.values()]).toEqual(projectSession(manager.getBranch(), [state])[0]!.items);
    const completed = projectSession(manager.getBranch(), [{ ...state, status: "SUCCEEDED" }])[0]!;
    expect(completed.items.filter((item) => item.kind === "text")).toMatchObject([
      { phase: "process", text: "开始生成" }, { phase: "final", text: "海报已完成" },
    ]);
  });
  it("continues NORMAL history with a real Agent loop and saves each tool result only once", async () => {
    const { binding, faux } = await createFauxBinding();
    const manager = SessionManager.inMemory();
    await runNormalGeneration(manager, { creationId: "20", mode: "NORMAL",
      input: { prompt: "咖啡海报", assets: [] }, settings: { aspectRatio: "1:1", imageCount: 1 } },
      async () => ({ generationId: "21", status: "SUCCEEDED", assets: [{ assetId: "31", url: "https://oss.example/31.png" }] }));
    const tools = createGenerationTools({ authorizedInputAssetIds: new Set(["31"]),
      constraints: { aspectRatio: "AUTO", imageCount: 1 }, executor: { execute: async () => ({
        generationId: "23", status: "SUCCEEDED", assets: [{ assetId: "32", url: "https://oss.example/32.png" }] }) } });
    faux.setResponses([(context) => {
      expect(context.messages.map((message) => message.role)).toEqual(["user", "assistant", "toolResult", "user"]);
      return fauxAssistantMessage([fauxToolCall("image_to_image", {
        prompt: "改为蓝色", aspectRatio: "1:1", imageCount: 1, inputAssetIds: ["31"] }, { id: "agent-22" })]);
    }, fauxAssistantMessage("已完成调整。")]);
    await runAgentPrompt({ sessionManager: manager, binding, prompt: "把上一张改为蓝色", maxTurns: 4, tools });
    const context = manager.buildSessionContext();
    expect(context.messages.filter((message) => message.role === "toolResult")).toHaveLength(2);
    expect(context.messages.at(-1)).toMatchObject({ role: "assistant", provider: binding.model.provider, model: binding.model.id });
    expect(JSON.stringify(manager.getBranch())).not.toMatch(/generation_completed|generation_result/);
  });

  it("runs one in-memory Pi loop and projects native lifecycle and text events", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    faux.setResponses([fauxAssistantMessage("你好，我是 AiVista。")]);
    const events: AgentRuntimeEvent[] = [];

    const result = await runAgentPrompt({ sessionManager,
      binding,
      prompt: "你好",
      maxTurns: 20,
      onEvent: (event) => events.push(event),
    });

    expect(result).toMatchObject({ outcome: "COMPLETED", text: "你好，我是 AiVista。" });
    expect(sessionManager.buildSessionContext().messages).toHaveLength(2);
    expect(events[0]).toEqual({ type: "agent_start" });
    expect(events).toContainEqual({ type: "turn_start", turn: 1 });
    expect(events).toContainEqual({ type: "text_end", contentIndex: 0, text: "你好，我是 AiVista。" });
  });

  it("rejects a turn budget outside the configured product limit", async () => {
    const { binding } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();

    await expect(runAgentPrompt({ sessionManager, binding, prompt: "你好", maxTurns: 21 }))
      .rejects.toThrow("maxTurns must be an integer between 1 and 20");
  });

  it.each([true, false])("sets outgoing single-tool policy only when tools are available (%s)", async (withTools) => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response([
      { id: "reply", object: "chat.completion.chunk", created: 1, model: "test-model",
        choices: [{ index: 0, delta: { role: "assistant", content: "已查看参考图片。" }, finish_reason: null }] },
      { id: "reply", object: "chat.completion.chunk", created: 1, model: "test-model",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ].map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", {
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const binding = await createAgentModelBinding({
      AIVISTA_AGENT_BAILIAN_BASE_URL: "https://model.example/compatible-mode/v1",
      AIVISTA_AGENT_BAILIAN_API_KEY: "test-key",
      AIVISTA_AGENT_MODEL: "test-model",
      AIVISTA_AGENT_THINKING_ENABLED: false,
    });
    const asset = { assetId: "701", url: "https://images.example/701.png" };
    const tools = withTools ? [createInspectImageTool({ inspect: async () => ({ assetId: asset.assetId, asset }) })] : [];

    await runAgentPrompt({ binding, prompt: "请查看参考图片 [aivista-image:701]", maxTurns: 2, tools,
      adaptProviderRequest: async (payload) => {
        await Promise.resolve();
        const adapted = injectModelImages(payload, new Map([[asset.assetId, asset]]), (url) => `${url}?signed=true`);
        return { ...adapted as object, ...(withTools ? { parallel_tool_calls: true } : {}) };
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(payload.enable_thinking).toBe(false);
    if (withTools) expect(payload.parallel_tool_calls).toBe(false);
    else expect(payload).not.toHaveProperty("parallel_tool_calls");
    expect(payload.messages).toContainEqual(expect.objectContaining({ role: "user", content: [
      { type: "text", text: "请查看参考图片 [aivista-image:701]" },
      { type: "text", text: "参考图片资产 ID：701" },
      { type: "image_url", image_url: { url: "https://images.example/701.png?signed=true" } },
    ] }));
  });

  it("restores the persisted Pi context into the request-scoped session with original roles", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    let rolesAndText: string[] = [];
    faux.setResponses([(context) => {
      rolesAndText = context.messages.map((message) => {
        const text = typeof message.content === "string" ? message.content
          : message.content.filter((item) => item.type === "text").map((item) => item.text).join("");
        return `${message.role}:${text}`;
      });
      return fauxAssistantMessage("继续创作。");
    }]);

    sessionManager.appendMessage({ role: "user", content: "制作一张饮品海报", timestamp: Date.now() });
    sessionManager.appendMessage(fauxAssistantMessage("海报已经生成。"));
    await runAgentPrompt({ sessionManager, binding, prompt: "把标题改成秋日特饮", maxTurns: 20 });

    expect(rolesAndText).toEqual([
      "user:制作一张饮品海报", "assistant:海报已经生成。", "user:把标题改成秋日特饮",
    ]);
  });

  it("binds injected images to their authorized Asset IDs in per-run system context", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    let systemPrompt = "";
    faux.setResponses([(context) => {
      systemPrompt = context.systemPrompt ?? "";
      return fauxAssistantMessage("已识别参考图片。");
    }]);

    await runAgentPrompt({ sessionManager,
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
    expect(systemPrompt).toContain("需要理解尚未见过的历史图片时再查看");
    expect(systemPrompt).toContain("公开回复和生图提示词使用用户当前语言");
    expect(systemPrompt).toContain("以用户本轮明确要求为准");
    expect(systemPrompt).toContain("先在同一条回复中用一句公开文字说明当前动作，再调用一个工具并等待结果");
    expect(systemPrompt).toContain("匹配 Skill 时先读取尚未阅读的技能");
    expect(systemPrompt).toContain("用户跳过不表示认可表单建议值");
  });

  it("feeds the formal generation Tool Result into the next Pi turn", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("text_to_image", {
        prompt: "夏日饮品海报",
        aspectRatio: "3:4",
        imageCount: 1,
      }), { stopReason: "toolUse" }),
      fauxAssistantMessage("海报已经生成。"),
    ]);
    const requests: GenerationToolRequest[] = [];
    const events: AgentRuntimeEvent[] = [];
    const traceRecorder = recorderSpy();
    const tools = createGenerationTools({
      constraints: { aspectRatio: "AUTO", imageCount: 0 },
      authorizedInputAssetIds: new Set(),
      executor: {
        async execute(_toolCallId, request) {
          requests.push(request);
          return { status: "SUCCEEDED", generationId: "9001", assets: [{ assetId: "7001", url: "https://oss.example/7001.png" }] };
        },
      },
    });

    const result = await runAgentPrompt({ sessionManager,
      binding,
      prompt: "生成一张夏日饮品海报",
      maxTurns: 20,
      tools,
      observer: traceRecorder as never,
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
    expect(traceRecorder.captureSystemPrompt).toHaveBeenCalledOnce();
    expect(traceRecorder.startGeneration).toHaveBeenCalledTimes(2);
    expect(traceRecorder.finishGeneration).toHaveBeenCalledTimes(2);
    expect(traceRecorder.startTool).toHaveBeenCalledOnce();
    expect(traceRecorder.finishTool).toHaveBeenCalledOnce();
  });

  it("persists an inspected URL reference without embedding image bytes", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    let nextTurnSawImage = false;
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("inspect_image", { assetId: "701" }), { stopReason: "toolUse" }),
      (context) => {
        const result = context.messages.findLast((message) => message.role === "toolResult");
        nextTurnSawImage = result?.role === "toolResult"
          && result.content.some((item) => item.type === "text" && item.text.includes("[aivista-image:701]"));
        return fauxAssistantMessage("我已理解这张历史图片。");
      },
    ]);
    const tool = createInspectImageTool({ inspect: async (assetId) => ({ assetId,
      asset: { assetId, url: "https://images.example/701.png" } }) });

    await runAgentPrompt({ sessionManager, binding, prompt: "看看上一张图片", maxTurns: 20, tools: [tool] });

    expect(nextTurnSawImage).toBe(true);
    expect(JSON.stringify(sessionManager.getEntries())).toContain("Asset ID: 701");
    expect(JSON.stringify(sessionManager.getEntries())).not.toContain("AQI=");
  });

  it("feeds an actionable failed Tool Result back so the model can correct the next call", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    let correctionContext = "";
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("image_to_image", {
        prompt: "改成暖橙色",
        aspectRatio: "3:4",
        imageCount: 1,
        inputAssetIds: ["999"],
      }), { stopReason: "toolUse" }),
      (context) => {
        correctionContext = JSON.stringify(context.messages);
        return fauxAssistantMessage(fauxToolCall("image_to_image", {
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
          return { status: "SUCCEEDED", generationId: "9002", assets: [{ assetId: "7002", url: "https://oss.example/7002.png" }] };
        },
      },
    });

    const result = await runAgentPrompt({ sessionManager, binding, prompt: "修改参考图", maxTurns: 20,
      tools, authorizedInputAssetIds: ["101"] });

    expect(correctionContext).toContain("INPUT_ASSET_NOT_AUTHORIZED");
    expect(correctionContext).toContain("本轮允许的图片资产 ID：101");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.inputAssetIds).toEqual(["101"]);
    expect(result).toMatchObject({ outcome: "COMPLETED", text: "已使用获授权的参考图重新生成。" });
  });

  it("persists the form Tool Result and settles without a second model call", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("request_user_input", {
        title: "电影感摄影图定制",
        fields: [{ id: "story", type: "TEXT", label: "主题或故事", required: true,
          value: "深夜车站，等不到末班车的人" }],
      }), { stopReason: "toolUse" }),
    ]);
    let settledCount = 0;
    const traceRecorder = recorderSpy();

    const result = await runAgentPrompt({ sessionManager, binding, prompt: "帮我生成电影剧照", maxTurns: 20,
      tools: [createRequestUserInputTool()], observer: traceRecorder as never, onEvent: (event) => {
        if (event.type === "agent_start") settledCount += 1;
      } });

    expect(result).toMatchObject({
      outcome: "WAITING_FOR_USER",
      request: { form: { schemaVersion: 2, title: "电影感摄影图定制" } },
    });
    expect(faux.state.callCount).toBe(1);
    expect(settledCount).toBe(1);
    expect(sessionManager.buildSessionContext().messages.at(-1)).toMatchObject({
      role: "toolResult", toolName: "request_user_input", isError: false,
      details: { outcome: "WAITING_FOR_USER" },
    });
    expect(traceRecorder.startGeneration).toHaveBeenCalledOnce();
    expect(traceRecorder.finishGeneration).toHaveBeenCalledOnce();
    expect(traceRecorder.startTool).toHaveBeenCalledOnce();
    expect(traceRecorder.finishTool).toHaveBeenCalledOnce();
  });

  it("blocks a batch without a form before any side effect, then accepts one tool per reply", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    const requests: string[] = [];
    const events: AgentRuntimeEvent[] = [];
    const call = (id: string) => fauxToolCall("text_to_image", {
      prompt: "测试海报", aspectRatio: "1:1", imageCount: 1,
    }, { id });
    faux.setResponses([
      fauxAssistantMessage([call("blocked-1"), call("blocked-2")], { stopReason: "toolUse" }),
      (context) => {
        expect(requests).toEqual([]);
        const results = context.messages.filter((message) => message.role === "toolResult");
        expect(results).toHaveLength(2);
        for (const result of results) expect(result).toMatchObject({ isError: true,
          content: [{ type: "text", text: expect.stringContaining("每条 assistant 消息最多调用一个工具") }] });
        return fauxAssistantMessage(call("allowed-1"), { stopReason: "toolUse" });
      },
      () => {
        expect(requests).toEqual(["allowed-1"]);
        return fauxAssistantMessage(call("allowed-2"), { stopReason: "toolUse" });
      },
      fauxAssistantMessage("两个方向已经完成。"),
    ]);
    const tools = createGenerationTools({ constraints: { aspectRatio: "AUTO", imageCount: 2 },
      authorizedInputAssetIds: new Set(), executor: { execute: async (toolCallId) => {
        requests.push(toolCallId);
        return { generationId: String(requests.length), status: "SUCCEEDED", assets: [
          { assetId: String(requests.length + 10), url: "https://images.example/result.png" },
        ] };
      } } });

    const result = await runAgentPrompt({ binding, sessionManager, prompt: "设计两个海报方向", maxTurns: 4, tools,
      onEvent: (event) => events.push(event) });

    expect(result).toMatchObject({ outcome: "COMPLETED", text: "两个方向已经完成。" });
    expect(requests).toEqual(["allowed-1", "allowed-2"]);
    expect(events.filter((event) => event.type === "tool_start").map((event) => event.toolCallId))
      .toEqual(["allowed-1", "allowed-2"]);
  });

  it("blocks every tool in a mixed form batch before any side effect runs", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    faux.setResponses([
      fauxAssistantMessage([
        fauxToolCall("request_user_input", {
          title: "确认海报信息",
          fields: [{ id: "theme", type: "TEXT", label: "主题", required: true, value: "" }],
        }),
        fauxToolCall("text_to_image", {
          prompt: "测试", aspectRatio: "1:1", imageCount: 1,
        }),
      ], { stopReason: "toolUse" }),
      fauxAssistantMessage(fauxToolCall("request_user_input", {
        title: "确认海报信息",
        fields: [{ id: "theme", type: "TEXT", label: "主题", required: true, value: "" }],
      }), { stopReason: "toolUse" }),
    ]);
    let generationCalls = 0;
    const events: AgentRuntimeEvent[] = [];
    const traceRecorder = recorderSpy();
    const tools = [createRequestUserInputTool(), ...createGenerationTools({
      constraints: { aspectRatio: "AUTO", imageCount: 0 },
      authorizedInputAssetIds: new Set(),
      executor: { async execute() {
        generationCalls += 1;
        return { status: "SUCCEEDED" as const, generationId: "1", assets: [{ assetId: "2", url: "https://oss.example/2.png" }] };
      } },
    })];

    const result = await runAgentPrompt({ sessionManager, binding, prompt: "做海报", maxTurns: 20, tools,
      observer: traceRecorder as never,
      onEvent: (event) => events.push(event) });

    expect(generationCalls).toBe(0);
    expect(events.filter((event) => event.type === "tool_start" || event.type === "tool_end"))
      .toEqual([
        expect.objectContaining({ type: "tool_start", toolName: "request_user_input" }),
        expect.objectContaining({ type: "tool_end", toolName: "request_user_input" }),
      ]);
    expect(faux.state.callCount).toBe(2);
    expect(result).toMatchObject({ outcome: "WAITING_FOR_USER" });
    expect(traceRecorder.startTool.mock.calls.map(([call]) => call.toolName))
      .toEqual(["request_user_input", "text_to_image", "request_user_input"]);
    expect(traceRecorder.finishTool).toHaveBeenCalledTimes(3);
  });

  it("blocks multiple input requests in one assistant message", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    faux.setResponses([
      fauxAssistantMessage([
        fauxToolCall("request_user_input", {
          title: "第一张表单",
          fields: [{ id: "theme", type: "TEXT", label: "主题", required: true, value: "" }],
        }),
        fauxToolCall("request_user_input", {
          title: "第二张表单",
          fields: [{ id: "style", type: "TEXT", label: "风格", required: true, value: "" }],
        }),
      ], { stopReason: "toolUse" }),
      fauxAssistantMessage(fauxToolCall("request_user_input", {
        title: "唯一有效表单",
        fields: [{ id: "theme", type: "TEXT", label: "主题", required: true, value: "" }],
      }), { stopReason: "toolUse" }),
    ]);
    const events: AgentRuntimeEvent[] = [];

    const result = await runAgentPrompt({ sessionManager, binding, prompt: "做海报", maxTurns: 20,
      tools: [createRequestUserInputTool()], onEvent: (event) => events.push(event) });

    expect(result).toMatchObject({ outcome: "WAITING_FOR_USER",
      request: { form: { title: "唯一有效表单" } } });
    expect(faux.state.callCount).toBe(2);
    expect(events.filter((event) => event.type === "tool_start" || event.type === "tool_end"))
      .toEqual([
        expect.objectContaining({ type: "tool_start", toolName: "request_user_input" }),
        expect.objectContaining({ type: "tool_end", toolName: "request_user_input" }),
      ]);
    const waitingResults = sessionManager.buildSessionContext().messages.filter((message) => message.role === "toolResult"
      && message.details && typeof message.details === "object"
      && Reflect.get(message.details, "outcome") === "WAITING_FOR_USER");
    expect(waitingResults).toHaveLength(1);
  });

  it("resumes from the native session with an appended form answer as a user message", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
    faux.setResponses([fauxAssistantMessage(fauxToolCall("request_user_input", {
      title: "确认海报信息", fields: [{ id: "theme", type: "TEXT", label: "主题", required: true, value: "" }],
    }), { stopReason: "toolUse" })]);
    const paused = await runAgentPrompt({ sessionManager, binding, prompt: "做一张海报", maxTurns: 20,
      tools: [createRequestUserInputTool()] });
    if (paused.outcome !== "WAITING_FOR_USER") throw new Error("Expected form");
    const original = JSON.stringify(sessionManager.getEntries());
    sessionManager.appendCustomMessageEntry(FORM_ANSWER, JSON.stringify({ creationId: "151",
      toolCallId: paused.request.toolCallId, action: "SUBMITTED", title: "确认海报信息",
      fields: [{ id: "theme", label: "主题", value: "关爱动物" }] }), false);
    let messages = "";
    faux.setResponses([(context) => { messages = JSON.stringify(context.messages); return fauxAssistantMessage("继续创作。"); }]);
    await runAgentPrompt({ sessionManager, binding, prompt: "请继续", maxTurns: 20 });
    expect(messages).toContain("关爱动物");
    expect(messages).toContain('"role":"user"');
    expect(original).not.toContain("关爱动物");
    expect(messages).toContain("WAITING_FOR_USER");
  });

  it("aborts without completing a turn beyond the twentieth", async () => {
    const { binding, faux } = await createFauxBinding();
    const sessionManager = SessionManager.inMemory();
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

    await expect(runAgentPrompt({ sessionManager,
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
    const sessionManager = SessionManager.inMemory();
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

    const run = runAgentPrompt({ sessionManager, binding, prompt: "等待取消", maxTurns: 20, tools: [tool],
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

function recorderSpy() {
  return {
    captureSystemPrompt: vi.fn(),
    startGeneration: vi.fn(),
    finishGeneration: vi.fn(),
    startTool: vi.fn(),
    finishTool: vi.fn(),
  };
}
