import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { getInspiration } from "../api/inspiration-api";
import { usePublicImageDetail } from "./use-public-image-detail";

vi.mock("../api/inspiration-api", () => ({ getInspiration: vi.fn() }));

const asset = (id: string, expired = false) => ({
  id,
  imageUrls: {
    thumbnail: null,
    display: { url: `https://cdn.example/${id}.webp`, expiresAt: expired ? "2020-01-01T00:00:00Z" : "2099-01-01T00:00:00Z" },
  },
}) as GenerationAsset;

describe("usePublicImageDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/inspirations");
  });

  it("pushes history when opening and replaces it when navigating", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const first = asset("1");
    const second = asset("2");
    const { result } = renderHook(() => usePublicImageDetail());

    await act(async () => result.current.open(first));
    await act(async () => result.current.navigate(second));

    expect(pushState).toHaveBeenCalledWith(expect.objectContaining({ imageId: "1" }), "", "/inspirations?imageId=1");
    expect(replaceState).toHaveBeenLastCalledWith(expect.objectContaining({ imageId: "2" }), "", "/inspirations?imageId=2");
    expect(result.current.image?.id).toBe("2");
  });

  it("does not let an older refresh replace a newer navigation", async () => {
    let resolveRefresh!: (image: GenerationAsset) => void;
    vi.mocked(getInspiration).mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    const first = asset("1");
    const refreshing = asset("2", true);
    const latest = asset("3");
    const { result } = renderHook(() => usePublicImageDetail());
    await act(async () => result.current.open(first));

    let pending!: Promise<void>;
    act(() => { pending = result.current.navigate(refreshing); });
    await act(async () => result.current.navigate(latest));
    await act(async () => {
      resolveRefresh({ ...refreshing, imageUrls: latest.imageUrls });
      await pending;
    });

    expect(result.current.image?.id).toBe("3");
  });
});
