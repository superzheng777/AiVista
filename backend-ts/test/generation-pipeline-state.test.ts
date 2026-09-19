import { describe, expect, it, vi } from "vitest";
import { GenerationPipelineStateService } from "../src/generation/generation-pipeline-state.service.js";

describe("GenerationPipelineStateService", () => {
  it.each([
    [undefined, 0, "IGNORE_MESSAGE"],
    [{ status: "SUCCEEDED", revision: 3 }, 0, "DELIVER_COMMITTED_RESULT"],
    [{ status: "QUEUED", revision: 1 }, 0, "IGNORE_MESSAGE"],
    [{ status: "QUEUED", revision: 0 }, 0, "EXECUTE_PIPELINE"],
    [{ status: "GENERATING", revision: 1 }, 1, "FAIL_INTERRUPTED_PIPELINE"],
    [{ status: "SAVING", revision: 2 }, 2, "FAIL_INTERRUPTED_PIPELINE"],
  ])("maps task %o and expected revision %i to %s", async (task, expectedRevision, kind) => {
    const query: any = {};
    query.selectAll = vi.fn(() => query);
    query.where = vi.fn(() => query);
    query.executeTakeFirst = vi.fn().mockResolvedValue(task);
    const service = new GenerationPipelineStateService({ db: { selectFrom: vi.fn(() => query) } } as never);

    await expect(service.prepare({ generationTaskId: 301n, expectedRevision })).resolves
      .toMatchObject({ kind });
  });
});
