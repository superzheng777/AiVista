import { describe, expect, it, vi } from "vitest";
import { GenerationPipelineExecutionService } from "../src/generation/generation-pipeline-execution.service.js";

describe("GenerationPipelineExecutionService", () => {
  it("reports user-visible phases and commits the transferred result", async () => {
    const calls: string[] = [];
    const java = {
      reportPhase: vi.fn(async (_taskId: bigint, phase: string) => {
        calls.push(phase.toLowerCase());
        return { taskId: "301", status: phase, taskVersion: phase === "GENERATING" ? 1 : 2 };
      }),
      complete: vi.fn(async () => { calls.push("complete"); return {
        taskId: "301", status: "SUCCEEDED", taskVersion: 3, assets: [] }; }),
    };
    const bailian = {
      generate: vi.fn(async () => { calls.push("provider"); return { requestId: "req-1",
        imageUrls: ["https://provider/1"], snapshot: "provider-json" }; }),
      restore: vi.fn(() => ({ imageUrls: ["https://provider/1"] })),
    };
    const transfer = { transfer: vi.fn(async () => { calls.push("transfer"); return [{ sourceIndex: 0,
      objectKey: "generation/7/tasks/301/0", fileSize: 12n, width: 1024, height: 1024 }]; }) };
    const coordinator = { complete: vi.fn(() => { calls.push("notify-tool"); }) };
    const service = serviceWith({ prepare: vi.fn().mockResolvedValue({ kind: "START", task: generationTask() }) },
      java, bailian, transfer, coordinator);

    expect(await service.execute({ eventId: 11n, taskId: 301n, taskVersion: 0 })).toBe(true);
    expect(calls).toEqual(["generating", "provider", "saving", "transfer", "complete", "notify-tool"]);
    expect(java.complete).toHaveBeenCalledWith(expect.objectContaining({
      completionId: "generation-301-3", outcome: "COMPLETED", expectedImageCount: 1,
    }));
  });

  it("replays Java's terminal snapshot without calling the provider", async () => {
    const java = { reportPhase: vi.fn(), complete: vi.fn(), getCompletion: vi.fn().mockResolvedValue({
      taskId: "301", status: "SUCCEEDED", taskVersion: 3, assets: [],
    }) };
    const bailian = { generate: vi.fn(), restore: vi.fn() };
    const coordinator = { complete: vi.fn() };
    const service = serviceWith({ prepare: vi.fn().mockResolvedValue({ kind: "ACK" }) }, java, bailian,
      { transfer: vi.fn() }, coordinator);

    expect(await service.execute({ eventId: 11n, taskId: 301n, taskVersion: 0 })).toBe(true);
    expect(java.getCompletion).not.toHaveBeenCalled();
    expect(java.complete).not.toHaveBeenCalled();
    expect(bailian.generate).not.toHaveBeenCalled();

    const replay = serviceWith({ prepare: vi.fn().mockResolvedValue({ kind: "TERMINAL" }) }, java, bailian,
      { transfer: vi.fn() }, coordinator);
    expect(await replay.execute({ eventId: 12n, taskId: 301n, taskVersion: 0 })).toBe(true);
    expect(java.getCompletion).toHaveBeenCalledWith(301n);
    expect(coordinator.complete).toHaveBeenCalled();
  });

  it("acks a concurrent duplicate without starting a second provider call", async () => {
    let releaseProvider!: () => void;
    const providerWait = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const state = { prepare: vi.fn().mockResolvedValue({ kind: "START", task: generationTask() }) };
    const java = {
      reportPhase: vi.fn(async (_taskId: bigint, phase: string) => ({ taskId: "301", status: phase,
        taskVersion: phase === "GENERATING" ? 1 : 2 })),
      complete: vi.fn().mockResolvedValue({}),
    };
    const bailian = { generate: vi.fn(async () => { await providerWait; return { requestId: "req-1",
      imageUrls: ["https://provider/1"], snapshot: "provider-json" }; }),
      restore: vi.fn(() => ({ imageUrls: ["https://provider/1"] })) };
    const transfer = { transfer: vi.fn().mockResolvedValue([{ sourceIndex: 0,
      objectKey: "generation/7/tasks/301/0", fileSize: 12n, width: 1024, height: 1024 }]) };
    const service = serviceWith(state, java, bailian, transfer, { complete: vi.fn() });
    const command = { eventId: 11n, taskId: 301n, taskVersion: 0 };

    const first = service.execute(command);
    await vi.waitFor(() => expect(bailian.generate).toHaveBeenCalledOnce());
    expect(await service.execute(command)).toBe(true);
    expect(state.prepare).toHaveBeenCalledOnce();
    releaseProvider();
    expect(await first).toBe(true);
  });
});

function serviceWith(state: object, java: object, bailian: object, transfer: object, coordinator: object) {
  return new GenerationPipelineExecutionService({ get: vi.fn().mockReturnValue(0) } as never,
    state as never, java as never, bailian as never, transfer as never,
    { acquire: vi.fn().mockResolvedValue(() => undefined) } as never, coordinator as never);
}
function generationTask() {
  return { id: 301n, user_id: 7n, requested_image_count: 1, width: 1024, height: 1024 } as never;
}
