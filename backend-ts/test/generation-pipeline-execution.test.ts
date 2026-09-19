import { describe, expect, it, vi } from "vitest";
import { GenerationPipelineExecutionService } from "../src/generation/generation-pipeline-execution.service.js";
import { BailianTransportError } from "../src/generation/generation-provider-error.js";

describe("GenerationPipelineExecutionService", () => {
  it("reports user-visible phases and commits the transferred result", async () => {
    const calls: string[] = [];
    const java = {
      reportPhase: vi.fn(async (_generationTaskId: bigint, phase: string) => {
        calls.push(phase.toLowerCase());
        return { generationTaskId: "301", status: phase, revision: phase === "GENERATING" ? 1 : 2 };
      }),
      complete: vi.fn(async () => { calls.push("complete"); return {
        generationTaskId: "301", status: "SUCCEEDED", revision: 3, assets: [] }; }),
    };
    const bailian = {
      generate: vi.fn(async () => { calls.push("provider"); return { requestId: "req-1",
        imageUrls: ["https://provider/1"], snapshot: "provider-json" }; }),
      restore: vi.fn(() => ({ imageUrls: ["https://provider/1"] })),
    };
    const transfer = { transfer: vi.fn(async () => { calls.push("transfer"); return [{ sourceIndex: 0,
      objectKey: "generation/7/tasks/301/0", fileSize: 12n, width: 1024, height: 1024 }]; }) };
    const coordinator = { complete: vi.fn(() => { calls.push("notify-tool"); }) };
    const service = serviceWith({ prepare: vi.fn().mockResolvedValue({ kind: "EXECUTE_PIPELINE", task: generationTask() }) },
      java, bailian, transfer, coordinator);

    expect(await service.execute({ generationTaskId: 301n, expectedRevision: 0 })).toBe(true);
    expect(calls).toEqual(["generating", "provider", "saving", "transfer", "complete", "notify-tool"]);
    expect(java.complete).toHaveBeenCalledWith(expect.objectContaining({
      generationTaskId: "301", outcome: "COMPLETED", expectedImageCount: 1,
    }));
  });

  it("replays Java's terminal snapshot without calling the provider", async () => {
    const java = { reportPhase: vi.fn(), complete: vi.fn(), getCompletion: vi.fn().mockResolvedValue({
      generationTaskId: "301", status: "SUCCEEDED", revision: 3, assets: [],
    }) };
    const bailian = { generate: vi.fn(), restore: vi.fn() };
    const coordinator = { complete: vi.fn() };
    const service = serviceWith({ prepare: vi.fn().mockResolvedValue({ kind: "IGNORE_MESSAGE" }) }, java, bailian,
      { transfer: vi.fn() }, coordinator);

    expect(await service.execute({ generationTaskId: 301n, expectedRevision: 0 })).toBe(true);
    expect(java.getCompletion).not.toHaveBeenCalled();
    expect(java.complete).not.toHaveBeenCalled();
    expect(bailian.generate).not.toHaveBeenCalled();

    const replay = serviceWith({ prepare: vi.fn().mockResolvedValue({ kind: "DELIVER_COMMITTED_RESULT" }) }, java, bailian,
      { transfer: vi.fn() }, coordinator);
    expect(await replay.execute({ generationTaskId: 301n, expectedRevision: 0 })).toBe(true);
    expect(java.getCompletion).toHaveBeenCalledWith(301n);
    expect(coordinator.complete).toHaveBeenCalled();
  });

  it("acks a concurrent duplicate without starting a second provider call", async () => {
    let releaseProvider!: () => void;
    const providerWait = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const state = { prepare: vi.fn().mockResolvedValue({ kind: "EXECUTE_PIPELINE", task: generationTask() }) };
    const java = {
      reportPhase: vi.fn(async (_generationTaskId: bigint, phase: string) => ({ generationTaskId: "301", status: phase,
        revision: phase === "GENERATING" ? 1 : 2 })),
      complete: vi.fn().mockResolvedValue({}),
    };
    const bailian = { generate: vi.fn(async () => { await providerWait; return { requestId: "req-1",
      imageUrls: ["https://provider/1"], snapshot: "provider-json" }; }),
      restore: vi.fn(() => ({ imageUrls: ["https://provider/1"] })) };
    const transfer = { transfer: vi.fn().mockResolvedValue([{ sourceIndex: 0,
      objectKey: "generation/7/tasks/301/0", fileSize: 12n, width: 1024, height: 1024 }]) };
    const service = serviceWith(state, java, bailian, transfer, { complete: vi.fn() });
    const command = { generationTaskId: 301n, expectedRevision: 0 };

    const first = service.execute(command);
    await vi.waitFor(() => expect(bailian.generate).toHaveBeenCalledOnce());
    expect(await service.execute(command)).toBe(true);
    expect(state.prepare).toHaveBeenCalledOnce();
    releaseProvider();
    expect(await first).toBe(true);
  });

  it("wakes the Agent Tool when a phase report observes an already committed task", async () => {
    const committed = { generationTaskId: "301", status: "SUCCEEDED", revision: 3, assets: [] };
    const java = {
      reportPhase: vi.fn().mockResolvedValue(committed),
      getCompletion: vi.fn().mockResolvedValue(committed),
      complete: vi.fn(),
    };
    const bailian = { generate: vi.fn(), restore: vi.fn() };
    const coordinator = { complete: vi.fn() };
    const service = serviceWith({ prepare: vi.fn().mockResolvedValue({
      kind: "EXECUTE_PIPELINE", task: generationTask(),
    }) }, java, bailian, { transfer: vi.fn() }, coordinator);

    await expect(service.execute({ generationTaskId: 301n, expectedRevision: 0 })).resolves.toBe(true);
    expect(java.getCompletion).toHaveBeenCalledWith(301n);
    expect(coordinator.complete).toHaveBeenCalledWith(committed);
    expect(bailian.generate).not.toHaveBeenCalled();
    expect(java.complete).not.toHaveBeenCalled();
  });

  it("fails an interrupted provider phase without calling the provider again", async () => {
    const task = { ...generationTask(), status: "GENERATING", revision: 1, provider_request_id: null };
    const java = { reportPhase: vi.fn(), getCompletion: vi.fn(),
      complete: vi.fn().mockResolvedValue({ generationTaskId: "301", status: "FAILED", revision: 2,
        failureCode: "PROVIDER_CALL_OUTCOME_UNKNOWN", assets: [] }) };
    const bailian = { generate: vi.fn(), restore: vi.fn() };
    const coordinator = { complete: vi.fn() };
    const service = serviceWith({ prepare: vi.fn().mockResolvedValue({
      kind: "FAIL_INTERRUPTED_PIPELINE", task,
    }) }, java, bailian, { transfer: vi.fn() }, coordinator);

    await expect(service.execute({ generationTaskId: 301n, expectedRevision: 1 })).resolves.toBe(true);
    expect(bailian.generate).not.toHaveBeenCalled();
    expect(java.reportPhase).not.toHaveBeenCalled();
    expect(java.complete).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "FAILED", expectedRevision: 1, failureCode: "PROVIDER_CALL_OUTCOME_UNKNOWN",
    }));
    expect(coordinator.complete).toHaveBeenCalled();
  });

  it("does not retry an ambiguous transport failure that may have reached the Provider", async () => {
    const java = {
      reportPhase: vi.fn().mockResolvedValue({ generationTaskId: "301", status: "GENERATING", revision: 1 }),
      complete: vi.fn().mockResolvedValue({ generationTaskId: "301", status: "FAILED", revision: 2,
        failureCode: "PROVIDER_CALL_OUTCOME_UNKNOWN", assets: [] }),
    };
    const bailian = { generate: vi.fn().mockRejectedValue(
      new BailianTransportError(new Error("socket closed"), false)), restore: vi.fn() };
    const coordinator = { complete: vi.fn() };
    const service = serviceWith({ prepare: vi.fn().mockResolvedValue({
      kind: "EXECUTE_PIPELINE", task: generationTask(),
    }) }, java, bailian, { transfer: vi.fn() }, coordinator, 3);

    await expect(service.execute({ generationTaskId: 301n, expectedRevision: 0 })).resolves.toBe(true);
    expect(bailian.generate).toHaveBeenCalledOnce();
    expect(java.complete).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "FAILED", failureCode: "PROVIDER_CALL_OUTCOME_UNKNOWN",
    }));
  });
});

function serviceWith(state: object, java: object, bailian: object, transfer: object, coordinator: object,
    maxRetries = 0) {
  return new GenerationPipelineExecutionService({ get: vi.fn().mockReturnValue(maxRetries) } as never,
    state as never, java as never, bailian as never, transfer as never,
    { acquire: vi.fn().mockResolvedValue(() => undefined) } as never, coordinator as never);
}
function generationTask() {
  return { id: 301n, user_id: 7n, requested_image_count: 1, width: 1024, height: 1024 };
}
