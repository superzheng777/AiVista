import { describe, expect, it } from "vitest";
import { GenerationCompletionCoordinatorService } from
  "../src/generation/generation-completion-coordinator.service.js";

describe("GenerationCompletionCoordinatorService", () => {
  it("resolves a Tool waiter with the Java-committed result", async () => {
    const coordinator = new GenerationCompletionCoordinatorService();
    const waiting = coordinator.wait("301");
    coordinator.complete(result("301"));
    await expect(waiting).resolves.toMatchObject({ generationTaskId: "301", status: "SUCCEEDED" });
  });

  it("closes the completion-before-waiter race", async () => {
    const coordinator = new GenerationCompletionCoordinatorService();
    coordinator.complete(result("301"));
    await expect(coordinator.wait("301")).resolves.toMatchObject({ generationTaskId: "301" });
  });

  it("removes a cancelled waiter", async () => {
    const coordinator = new GenerationCompletionCoordinatorService();
    const abort = new AbortController();
    const waiting = coordinator.wait("301", abort.signal);
    abort.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });

    coordinator.complete(result("301"));
    const secondAbort = new AbortController();
    const secondWait = coordinator.wait("301", secondAbort.signal);
    secondAbort.abort();
    await expect(secondWait).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects a duplicate waiter for the same task in a single process", async () => {
    const coordinator = new GenerationCompletionCoordinatorService();
    const abort = new AbortController();
    const first = coordinator.wait("301", abort.signal);
    expect(() => coordinator.wait("301")).toThrow("already waiting");
    abort.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
  });
});

function result(generationTaskId: string) {
  return { generationTaskId, status: "SUCCEEDED" as const, revision: 1, failureCode: null,
    assets: [{ assetId: "501", sourceIndex: 0, width: 1536, height: 2048 }] };
}
