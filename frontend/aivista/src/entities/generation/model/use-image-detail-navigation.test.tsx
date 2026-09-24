import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { useImageDetailNavigation } from "./use-image-detail-navigation";

const image = (id: string) => ({ id }) as GenerationAsset;

describe("useImageDetailNavigation", () => {
  it("selects adjacent images from the current array", async () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useImageDetailNavigation({
        items: [image("1"), image("2"), image("3")],
        currentImageId: "2",
        onSelect,
      }),
    );

    expect(result.current.hasPrevious).toBe(true);
    expect(result.current.hasNext).toBe(true);
    await act(async () => result.current.next());
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "3" }));
  });

  it("loads the next page before moving past the loaded boundary", async () => {
    const onSelect = vi.fn();
    const loadNextPage = vi.fn().mockResolvedValue([image("1"), image("2")]);
    const { result } = renderHook(() =>
      useImageDetailNavigation({
        items: [image("1")],
        currentImageId: "1",
        onSelect,
        hasNextPage: true,
        loadNextPage,
      }),
    );

    expect(result.current.hasNext).toBe(true);
    await act(async () => result.current.next());
    expect(loadNextPage).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }));
  });

  it("supports collections that prepend older pages", async () => {
    const onSelect = vi.fn();
    const loadPreviousPage = vi.fn().mockResolvedValue([image("0"), image("1")]);
    const { result } = renderHook(() =>
      useImageDetailNavigation({
        items: [image("1")],
        currentImageId: "1",
        onSelect,
        hasPreviousPage: true,
        loadPreviousPage,
      }),
    );

    expect(result.current.hasPrevious).toBe(true);
    await act(async () => result.current.previous());
    expect(loadPreviousPage).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "0" }));
  });
});
