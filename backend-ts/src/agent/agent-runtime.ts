import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type InlineExtension,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AgentModelBinding } from "./providers/bailian.js";
import type { AssistantMessage, ImageContent } from "@earendil-works/pi-ai";
import type { AgentGenerationConstraints } from "./tools/generation.js";
import { exportAgentContext, restoreAgentContext, type AgentSessionContext } from "./agent-context.js";
import { inputRequestFromToolResult, REQUEST_USER_INPUT_TOOL_NAME,
  type AgentInputRequest } from "./tools/request-user-input.js";

export const AGENT_PROJECT_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export type AgentRuntimeEvent =
  | { type: "agent_start" }
  | { type: "turn_start"; turn: number }
  | { type: "text_start"; contentIndex: number }
  | { type: "text_delta"; contentIndex: number; delta: string }
  | { type: "text_end"; contentIndex: number; text: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_progress"; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean };

/** Optional side-channel for run diagnostics; implementations must remain fail-open. */
export interface AgentRuntimeObserver {
  captureSystemPrompt(systemPrompt: string): void;
  startGeneration(messages: unknown): void;
  finishGeneration(message: AssistantMessage): void;
  startTool(input: { toolCallId: string; toolName: string; args: unknown }): void;
  finishTool(input: { toolCallId: string; result: unknown; isError: boolean }): void;
}

export interface RunAgentPromptOptions {
  binding: AgentModelBinding;
  prompt: string;
  maxTurns: number;
  tools?: Array<ToolDefinition<any, any>>;
  images?: ImageContent[];
  authorizedInputAssetIds?: string[];
  generationConstraints?: AgentGenerationConstraints;
  context?: AgentSessionContext | null;
  signal?: AbortSignal;
  onEvent?: (event: AgentRuntimeEvent) => void;
  observer?: AgentRuntimeObserver;
}

export type AgentPromptResult =
  | { outcome: "COMPLETED"; text: string; context: AgentSessionContext }
  | { outcome: "WAITING_FOR_USER"; request: AgentInputRequest; context: AgentSessionContext };

export class AgentTurnLimitError extends Error {
  constructor(readonly maxTurns: number) {
    super(`Agent exceeded the ${maxTurns} turn limit`);
    this.name = "AgentTurnLimitError";
  }
}

export async function runAgentPrompt(options: RunAgentPromptOptions): Promise<AgentPromptResult> {
  if (!Number.isInteger(options.maxTurns) || options.maxTurns < 1 || options.maxTurns > 20) {
    throw new RangeError("maxTurns must be an integer between 1 and 20");
  }
  // Keep Pi project-resource discovery independent from the shell launch directory.
  const emit = (event: AgentRuntimeEvent) => {
    try { options.onEvent?.(event); } catch { /* Product projection failures must not break Pi's loop. */ }
  };
  let turnLimitReached = false;
  let inputRequest: AgentInputRequest | undefined;
  const blockedMixedToolCallIds = new Set<string>();
  const extension: InlineExtension = {
    name: "aivista-harness",
    hidden: true,
    factory(pi) {
      pi.on("before_agent_start", (event) => {
        options.observer?.captureSystemPrompt(event.systemPrompt);
      });
      pi.on("context", (event) => {
        options.observer?.startGeneration(event.messages);
      });
      pi.on("turn_start", (event, context) => {
        if (event.turnIndex >= options.maxTurns) {
          turnLimitReached = true;
          context.abort();
          return;
        }
        emit({ type: "turn_start", turn: event.turnIndex + 1 });
      });
      pi.on("turn_end", (event, context) => {
        if (event.turnIndex + 1 >= options.maxTurns && event.toolResults.length > 0) {
          turnLimitReached = true;
          context.abort();
        }
      });
      pi.on("message_end", (event) => {
        if (event.message.role !== "assistant") return;
        options.observer?.finishGeneration(event.message);
        const toolCalls = event.message.content
          .filter((content) => content.type === "toolCall")
          .map((content) => ({ id: content.id, name: content.name }));
        if (toolCalls.length > 1
            && toolCalls.some((call) => call.name === REQUEST_USER_INPUT_TOOL_NAME)) {
          for (const call of toolCalls) blockedMixedToolCallIds.add(call.id);
        }
      });
      pi.on("tool_call", (event) => {
        if (blockedMixedToolCallIds.has(event.toolCallId)) {
          return {
            block: true,
            reason: "request_user_input 每条 assistant 消息只能调用一次，且不能与其他工具同时调用。",
          };
        }
      });
    },
  };
  const resourceLoader = new DefaultResourceLoader({
    cwd: AGENT_PROJECT_ROOT,
    agentDir: resolve(AGENT_PROJECT_ROOT, ".pi"),
    extensionFactories: [extension],
    noExtensions: true,
    noSkills: true,
    additionalSkillPaths: [resolve(AGENT_PROJECT_ROOT, ".pi", "skills")],
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: resolve(AGENT_PROJECT_ROOT, ".pi", "SYSTEM.md"),
    appendSystemPromptOverride: (base) => [
      ...base,
      ...authorizedInputAssetContext(options.authorizedInputAssetIds ?? []),
      ...generationConstraintContext(options.generationConstraints),
    ],
  });
  await resourceLoader.reload();
  const tools = options.tools ?? [];
  const sessionManager = SessionManager.inMemory(AGENT_PROJECT_ROOT);
  restoreAgentContext(sessionManager, options.context);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true, reserveTokens: 16_384, keepRecentTokens: 20_000 },
  });
  const { session } = await createAgentSession({
    cwd: AGENT_PROJECT_ROOT,
    modelRuntime: options.binding.modelRuntime,
    model: options.binding.model,
    thinkingLevel: "off",
    ...(tools.length === 0
      ? { noTools: "all" as const }
      : { tools: tools.map((tool) => tool.name), customTools: tools }),
    resourceLoader,
    sessionManager,
    settingsManager,
  });
  let resolveSettled!: () => void;
  const settled = new Promise<void>((resolvePromise) => { resolveSettled = resolvePromise; });
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "agent_start") emit({ type: "agent_start" });
    if (event.type === "agent_settled") resolveSettled();
    if (event.type === "tool_execution_start") {
      options.observer?.startTool({ toolCallId: event.toolCallId,
        toolName: event.toolName, args: event.args });
      if (blockedMixedToolCallIds.has(event.toolCallId)) return;
      emit({ type: "tool_start", toolCallId: event.toolCallId, toolName: event.toolName,
        args: event.args });
    }
    if (event.type === "tool_execution_update") {
      if (blockedMixedToolCallIds.has(event.toolCallId)) return;
      emit({ type: "tool_progress", toolCallId: event.toolCallId, toolName: event.toolName,
        partialResult: event.partialResult });
    }
    if (event.type === "tool_execution_end") {
      options.observer?.finishTool({ toolCallId: event.toolCallId,
        result: event.result, isError: event.isError });
      if (blockedMixedToolCallIds.has(event.toolCallId)) return;
      if (!event.isError && event.toolName === REQUEST_USER_INPUT_TOOL_NAME) {
        inputRequest = inputRequestFromToolResult(event.toolCallId, event.result);
      }
      emit({ type: "tool_end", toolCallId: event.toolCallId, toolName: event.toolName,
        result: event.result, isError: event.isError });
    }
    if (event.type !== "message_update") return;
    const update = event.assistantMessageEvent;
    if (update.type === "text_start") {
      emit({ type: "text_start", contentIndex: update.contentIndex });
    } else if (update.type === "text_delta") {
      emit({ type: "text_delta", contentIndex: update.contentIndex, delta: update.delta });
    } else if (update.type === "text_end") {
      emit({ type: "text_end", contentIndex: update.contentIndex, text: update.content });
    }
  });

  let abortPromise: Promise<void> | undefined;
  const abort = () => { abortPromise ??= session.abort(); };
  try {
    options.signal?.throwIfAborted();
    options.signal?.addEventListener("abort", abort, { once: true });
    await session.prompt(options.prompt, options.images?.length ? { images: options.images } : undefined);
    await settled;
    if (abortPromise) await abortPromise;
    options.signal?.throwIfAborted();
    if (turnLimitReached) throw new AgentTurnLimitError(options.maxTurns);
    const context = exportAgentContext(sessionManager, options.authorizedInputAssetIds ?? []);
    if (inputRequest) return { outcome: "WAITING_FOR_USER", request: inputRequest, context };
    const text = session.getLastAssistantText()?.trim();
    if (!text) throw new Error("Agent returned an empty final response");
    return { outcome: "COMPLETED", text, context };
  } finally {
    options.signal?.removeEventListener("abort", abort);
    if (abortPromise) await abortPromise;
    unsubscribe();
    session.dispose();
  }
}

function authorizedInputAssetContext(assetIds: string[]): string[] {
  if (assetIds.length === 0) return [];
  const entries = assetIds.map((assetId, index) => `- 图片 ${index + 1}：Asset ID ${assetId}`).join("\n");
  return [`## 本轮授权参考图片\n${entries}\n调用 image_to_image 时，inputAssetIds 只能从上述 ID 中选择，且必须原样填写。不要在面向用户的回复中展示这些内部 ID。`];
}

function generationConstraintContext(constraints?: AgentGenerationConstraints): string[] {
  if (!constraints) return [];
  const aspectRatio = constraints.aspectRatio === "AUTO"
    ? "由你根据创作目标选择。" : `固定为 ${constraints.aspectRatio}，所有生成 Tool 必须使用该值。`;
  const imageCount = constraints.imageCount === 0
    ? "由你根据用户意图在 1 至 6 张中选择。"
    : `本轮最终目标为 ${constraints.imageCount} 张；多个生成 Tool 的 imageCount 总和不得超过该值。`;
  return [`## 本轮用户生成约束\n- 画幅比例：${aspectRatio}\n- 图片数量：${imageCount}`];
}
