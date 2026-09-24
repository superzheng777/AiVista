import { fireEvent, render, screen } from "@testing-library/react";
import { useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InspirationRoute } from "./inspiration-route";

vi.mock("next/navigation", () => ({ useSearchParams: vi.fn() }));
vi.mock("@/widgets/inspiration-feed/ui/inspiration-feed", () => ({
  InspirationFeed: () => <div>灵感列表</div>,
}));
vi.mock("@/features/inspiration/ui/direct-public-inspiration-detail", () => ({
  DirectPublicInspirationDetail: ({ imageId, onExit }: { imageId: string; onExit: () => void }) => (
    <div>
      直接详情 {imageId}
      <button type="button" onClick={onExit}>
        退出直接详情
      </button>
    </div>
  ),
}));

function params(value: string) {
  return new URLSearchParams(value) as ReturnType<typeof useSearchParams>;
}

describe("InspirationRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the feed mounted when a list item updates the detail URL", () => {
    vi.mocked(useSearchParams).mockReturnValue(params(""));
    const { rerender } = render(<InspirationRoute />);

    vi.mocked(useSearchParams).mockReturnValue(params("imageId=12"));
    rerender(<InspirationRoute />);

    expect(screen.getByText("灵感列表")).toBeInTheDocument();
    expect(screen.queryByText("直接详情 12")).not.toBeInTheDocument();
  });

  it("uses direct detail only when the page was entered with an image URL", () => {
    vi.mocked(useSearchParams).mockReturnValue(params("imageId=12"));
    const { rerender } = render(<InspirationRoute />);
    expect(screen.getByText("直接详情 12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "退出直接详情" }));
    vi.mocked(useSearchParams).mockReturnValue(params("imageId=12"));
    rerender(<InspirationRoute />);
    expect(screen.getByText("灵感列表")).toBeInTheDocument();
  });
});
