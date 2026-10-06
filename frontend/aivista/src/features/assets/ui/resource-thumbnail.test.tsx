import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { getGenerationAsset } from "@/features/assets/api/asset-api";
import { ResourceThumbnail } from "./resource-thumbnail";

vi.mock("@/features/assets/api/asset-api", () => ({ getGenerationAsset: vi.fn() }));

let visible: IntersectionObserverCallback;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        visible = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function setup(expiresAt: string) {
  const image = {
    id: "asset-1",
    imageUrls: { thumbnail: { url: "https://example.com/old", expiresAt }, display: null },
  } as GenerationAsset;
  const client = new QueryClient();
  client.setQueryData(["assets"], [image], { updatedAt: 1234 });
  render(
    <QueryClientProvider client={client}>
      <ResourceThumbnail image={image} alt="asset" />
    </QueryClientProvider>,
  );
  return { image, client };
}

describe("ResourceThumbnail", () => {
  it("refreshes an expired visible image without renewing list freshness", async () => {
    const { image, client } = setup("2020-01-01T00:00:00Z");
    vi.mocked(getGenerationAsset).mockResolvedValue({
      ...image,
      imageUrls: {
        thumbnail: { url: "https://example.com/new", expiresAt: "2099-01-01T00:00:00Z" },
        display: null,
      },
    });
    expect(screen.getByAltText("asset")).not.toHaveAttribute("src");
    expect(getGenerationAsset).not.toHaveBeenCalled();
    await act(async () => {
      visible([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await waitFor(() => expect(screen.getByAltText("asset")).toHaveAttribute("src", "https://example.com/new"));
    expect(getGenerationAsset).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(["assets"])?.dataUpdatedAt).toBe(1234);
    client.clear();
  });

  it("bounds retries when the refreshed image also fails to load", async () => {
    const { image, client } = setup("2099-01-01T00:00:00Z");
    vi.mocked(getGenerationAsset).mockResolvedValue({
      ...image,
      imageUrls: {
        thumbnail: { url: "https://example.com/new", expiresAt: "2099-01-01T00:00:00Z" },
        display: null,
      },
    });
    fireEvent.error(screen.getByAltText("asset"));
    await waitFor(() => expect(screen.getByAltText("asset")).toHaveAttribute("src", "https://example.com/new"));
    fireEvent.error(screen.getByAltText("asset"));
    expect(getGenerationAsset).toHaveBeenCalledTimes(1);
    client.clear();
  });
});
