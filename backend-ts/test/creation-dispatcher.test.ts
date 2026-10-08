import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/sessions/creation-runtime.service.js", () => ({ CreationRuntimeService: class {} }));
import { CreationDispatcherService } from "../src/sessions/creation-dispatcher.service.js";
import type { CreationRuntimeService } from "../src/sessions/creation-runtime.service.js";

afterEach(() => vi.useRealTimers());
describe("Local creation dispatcher", () => {
  it("starts more than four loops without awaiting their completion and rescans durable acceptance", async () => {
    vi.useFakeTimers();
    const rows = Array.from({ length: 8 }, (_, index) => ({ id: String(index + 1), revision: 0 }));
    const runtime = { onQueued: undefined as (() => void) | undefined,
      executions: { recoverInterrupted: vi.fn().mockResolvedValue(undefined), queued: vi.fn().mockResolvedValue(rows) },
      execute: vi.fn().mockImplementation(() => new Promise<void>(() => {})) };
    const dispatcher = new CreationDispatcherService(runtime as unknown as CreationRuntimeService);
    await dispatcher.onApplicationBootstrap();
    expect(runtime.executions.recoverInterrupted).toHaveBeenCalledOnce();
    expect(runtime.execute).toHaveBeenCalledTimes(8);
    expect(runtime.execute).toHaveBeenLastCalledWith("8", 0);
    runtime.executions.queued.mockResolvedValue([{ id: "9", revision: 3 }]);
    runtime.onQueued?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(runtime.execute).toHaveBeenLastCalledWith("9", 3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(runtime.executions.queued).toHaveBeenCalledTimes(3);
    dispatcher.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runtime.executions.queued).toHaveBeenCalledTimes(3);
  });
});
