import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ runAgentPrompt: vi.fn() }));
vi.mock("../src/agent/agent-runtime.js", async (original) => {
  const actual = await original<typeof import("../src/agent/agent-runtime.js")>();
  return { ...actual, runAgentPrompt: runtime.runAgentPrompt };
});
import { AgentExecutionService } from "../src/agent/agent-execution.service.js";

describe("AgentExecutionService", () => {
  beforeEach(() => runtime.runAgentPrompt.mockReset());

  it("saves the replayable completion before committing Java and acknowledging", async () => {
    const calls: string[] = [];
    runtime.runAgentPrompt.mockResolvedValue({ text: "海报已生成。", turns: 2 });
    const state = { prepare: vi.fn().mockResolvedValue({ kind: "START" }),
      saveCompletion: vi.fn(async () => { calls.push("ledger"); }) };
    const java = { getAgentExecution: vi.fn().mockResolvedValue(snapshot()), createTask: vi.fn() };
    const completion = { complete: vi.fn(async () => { calls.push("java"); }) };
    const service = new AgentExecutionService(config(), state as never, java as never, completion as never,
      { load: vi.fn().mockResolvedValue([]) } as never,
      { get: vi.fn().mockResolvedValue({}) } as never, {} as never, realtime() as never,
      { submit: vi.fn() } as never);

    await expect(service.execute(command())).resolves.toBe(true);
    expect(calls).toEqual(["ledger", "java"]);
    expect(state.saveCompletion).toHaveBeenCalledWith(151n, expect.objectContaining({
      completionId: "agent-151", outcome: "SUCCEEDED", finalMessage: "海报已生成。",
    }), expect.any(Date));
  });

  it("does not start Pi when the Java snapshot is already terminal", async () => {
    const state = { prepare: vi.fn() };
    const service = new AgentExecutionService(config(), state as never,
      { getAgentExecution: vi.fn().mockResolvedValue({ ...snapshot(), status: "CANCELLED" }) } as never,
      {} as never, {} as never, {} as never, {} as never, realtime() as never, {} as never);

    await expect(service.execute(command())).resolves.toBe(true);
    expect(state.prepare).not.toHaveBeenCalled();
    expect(runtime.runAgentPrompt).not.toHaveBeenCalled();
  });

  it("converges an orphan RUNNING ledger without rerunning Pi", async () => {
    const completion = { complete: vi.fn().mockResolvedValue({}) };
    const service = new AgentExecutionService(config(),
      { prepare: vi.fn().mockResolvedValue({ kind: "INTERRUPTED" }) } as never,
      { getAgentExecution: vi.fn().mockResolvedValue(snapshot()) } as never,
      completion as never, {} as never, {} as never, {} as never, realtime() as never, {} as never);

    await expect(service.execute(command())).resolves.toBe(true);
    expect(completion.complete).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "FAILED", failureCode: "AGENT_RUNTIME_INTERRUPTED",
    }), undefined);
    expect(runtime.runAgentPrompt).not.toHaveBeenCalled();
  });

  it("persists stable Tool boundaries before the final completion", async () => {
    const calls: string[] = [];
    let finish!: (result: { text: string; turns: number }) => void;
    runtime.runAgentPrompt.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const activity = { submit: vi.fn(async (command) => { calls.push(command.activities[0].state); }) };
    const service = new AgentExecutionService(config(),
      { prepare: vi.fn().mockResolvedValue({ kind: "START" }),
        saveCompletion: vi.fn(async () => { calls.push("LEDGER"); }) } as never,
      { getAgentExecution: vi.fn().mockResolvedValue(snapshot()) } as never,
      { complete: vi.fn(async () => { calls.push("COMPLETION"); }) } as never,
      { load: vi.fn().mockResolvedValue([]) } as never,
      { get: vi.fn().mockResolvedValue({}) } as never, {} as never, realtime() as never,
      activity as never);

    const execution = service.execute(command());
    await vi.waitFor(() => expect(runtime.runAgentPrompt).toHaveBeenCalledTimes(1));
    const options = runtime.runAgentPrompt.mock.calls[0]![0];
    options.onEvent?.({ type: "tool_start", toolCallId: "call-1", toolName: "text_to_image", args: {} });
    options.onEvent?.({ type: "tool_end", toolCallId: "call-1", toolName: "text_to_image",
      result: { details: { outcome: "SUCCEEDED", taskId: "81" } }, isError: false });
    finish({ text: "完成。", turns: 2 });
    await execution;

    expect(calls).toEqual(["RUNNING", "COMPLETED", "LEDGER", "COMPLETION"]);
  });

  it("aborts the active Pi session and does not submit a completion after Java cancels", async () => {
    let control!: (value: { type: "CANCEL"; creationTaskId: string; revision: number }) => void;
    runtime.runAgentPrompt.mockImplementation(async (options) => {
      if (!options) return { text: "", turns: 0 };
      await new Promise<void>((resolve) => options.signal.addEventListener("abort", () => resolve(), { once: true }));
      throw new Error("aborted");
    });
    const state = { prepare: vi.fn().mockResolvedValue({ kind: "START" }),
      markInterrupted: vi.fn().mockResolvedValue(undefined) };
    const completion = { complete: vi.fn() };
    const realtimeClient = { publish: vi.fn(), waitUntilReady: vi.fn().mockResolvedValue(undefined),
      subscribeControl: vi.fn((listener) => { control = listener; }) };
    const service = new AgentExecutionService(config(), state as never,
      { getAgentExecution: vi.fn().mockResolvedValue(snapshot()) } as never, completion as never,
      { load: vi.fn().mockResolvedValue([]) } as never,
      { get: vi.fn().mockResolvedValue({}) } as never, {} as never, realtimeClient as never,
      { submit: vi.fn() } as never);

    const execution = service.execute(command());
    await vi.waitFor(() => expect(runtime.runAgentPrompt).toHaveBeenCalledTimes(1));
    const settledExecution = execution.then((value) => value);
    control({ type: "CANCEL", creationTaskId: "151", revision: 1 });

    await expect(settledExecution).resolves.toBe(true);
    expect(state.markInterrupted).toHaveBeenCalledWith(151n, expect.any(Date));
    expect(completion.complete).not.toHaveBeenCalled();
  });
});

function command() { return { eventId: 11n, creationTaskId: 151n, revision: 0 }; }
function snapshot() { return { contractVersion: 1, creationTaskId: "151", revision: 0, status: "RUNNING",
  sessionId: "101", prompt: "生成一张海报", history: [], inputAssets: [],
  constraints: { aspectRatio: "AUTO", imageCount: 0 } }; }
function config() { return { get: vi.fn((key: string) => key === "AIVISTA_AGENT_LOOP_TIMEOUT_MS" ? 60_000 : 20) } as never; }
function realtime() { return { publish: vi.fn(), waitUntilReady: vi.fn().mockResolvedValue(undefined),
  subscribeControl: vi.fn() }; }
