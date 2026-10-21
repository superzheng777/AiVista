import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAgentModelBinding, type AgentModelBinding } from "../../src/agent/providers/bailian.js";
import { validateEnvironment, type Environment } from "../../src/config/environment.js";
import { loadJavaLocalEnvironment } from "../../src/config/java-local-environment.js";
import { runAgentPrompt } from "../../src/agent/agent-runtime.js";

const enabled = process.env.RUN_AGENT_SMOKE === "true";
const smoke = describe.runIf(enabled);

smoke.sequential("Pi + Bailian qwen3.8-flash smoke", () => {
  let environment: Environment;
  let binding: AgentModelBinding;
  const sessions: Array<{ dispose(): void }> = [];

  beforeAll(async () => {
    environment = validateEnvironment({
      ...loadJavaLocalEnvironment(process.env.AIVISTA_JAVA_LOCAL_YAML, process.env), ...process.env,
    });
    binding = await createAgentModelBinding(environment);
  });

  afterAll(() => {
    for (const session of sessions) session.dispose();
  });

  it("streams a final text response with thinking disabled", async () => {
    expect(binding.thinkingLevel).toBe("off");
    let requests = 0;
    let deltaCount = 0;
    const manager = SessionManager.inMemory(process.cwd());
    const result = await runAgentPrompt({ binding, maxTurns: 2, sessionManager: manager,
      prompt: "请只用一句简短中文回答：你是谁？",
      signal: AbortSignal.timeout(90_000),
      adaptProviderRequest: (payload) => {
        expect(payload).toHaveProperty("enable_thinking", false);
        expect(payload).not.toHaveProperty("reasoning_effort");
        expect((payload as { messages: Array<{ role: string }> }).messages[0]?.role).toBe("system");
        requests += 1;
        return payload;
      },
      onDelta: () => { deltaCount += 1; },
    }).catch((error: unknown) => {
      const last = manager.getBranch().findLast((entry) => entry.type === "message" && entry.message.role === "assistant");
      if (last?.type === "message" && last.message.role === "assistant") {
        expect(last.message.stopReason, last.message.errorMessage).not.toBe("error");
      }
      throw error;
    });
    expect(requests).toBe(1);
    expect(deltaCount).toBeGreaterThan(0);
    expect(result).toMatchObject({ outcome: "COMPLETED", text: expect.any(String) });
  }, 120_000);

  it("executes a tool result and continues to a final response", async () => {
    let calls = 0;
    const tool = defineTool({
      name: "get_test_value",
      label: "Get test value",
      description: "Return the fixed test value. Use this tool when the user explicitly asks for the test value.",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        calls += 1;
        return {
          content: [{ type: "text" as const, text: "测试工具执行成功，值为 42。" }],
          details: { value: 42 },
        };
      },
    });
    const session = await createSmokeSession(binding, [tool]);
    sessions.push(session);

    await session.prompt("请务必调用 get_test_value 工具，然后告诉我工具返回的值。");

    expect(calls).toBe(1);
    expect(session.getLastAssistantText()).toContain("42");
  }, 120_000);

  it.runIf(Boolean(process.env.AIVISTA_AGENT_SMOKE_IMAGE_PATH))(
    "sends a WebP ImageContent to the model",
    async () => {
      const path = resolve(process.env.AIVISTA_AGENT_SMOKE_IMAGE_PATH!);
      if (extname(path).toLowerCase() !== ".webp") throw new Error("Smoke image must be a .webp file");
      const session = await createSmokeSession(binding, []);
      sessions.push(session);

      await session.prompt("请用一句中文描述这张图片。", {
        images: [{ type: "image", data: readFileSync(path).toString("base64"), mimeType: "image/webp" }],
      });

      const text = session.getLastAssistantText()?.trim();
      const last = [...session.messages].reverse().find((message) => message.role === "assistant");
      expect(text, last?.role === "assistant"
        ? `stopReason=${last.stopReason}; error=${last.errorMessage ?? "none"}` : "No assistant message")
        .toBeTruthy();
    },
    120_000,
  );
});

async function createSmokeSession(binding: AgentModelBinding, customTools: ToolDefinition[]) {
  const cwd = resolve(process.cwd());
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: resolve(cwd, ".pi"),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: resolve(cwd, ".pi", "SYSTEM.md"),
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    modelRuntime: binding.modelRuntime,
    model: binding.model,
    thinkingLevel: binding.thinkingLevel,
    tools: customTools.length > 0 ? customTools.map((tool) => tool.name) : [],
    customTools,
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
  });
  return session;
}
