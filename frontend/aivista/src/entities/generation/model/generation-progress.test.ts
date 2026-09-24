import { describe, expect, it } from "vitest";
import { generationImageProgress } from "./generation";

describe("generationImageProgress", () => {
  it("uses authoritative task image counts instead of Agent Tool attempt counts", () => {
    expect(generationImageProgress([{ requestedImageCount: 1, completedImageCount: 0, failedImageCount: 0 }])).toEqual({
      completed: 0,
      failed: 0,
      total: 1,
    });
  });

  it("supports one multi-image task and multiple real tasks", () => {
    expect(
      generationImageProgress([
        { requestedImageCount: 3, completedImageCount: 2, failedImageCount: 1 },
        { requestedImageCount: 2, completedImageCount: 2, failedImageCount: 0 },
      ]),
    ).toEqual({ completed: 4, failed: 1, total: 5 });
  });

  it("does not invent image progress before a generation task exists", () => {
    expect(generationImageProgress([])).toEqual({ completed: 0, failed: 0, total: 0 });
  });
});
