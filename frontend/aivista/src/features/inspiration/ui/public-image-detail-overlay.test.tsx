import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { PublicImageDetailOverlay } from "./public-image-detail-overlay";

vi.mock("./public-image-detail", () => ({
  PublicImageDetail: () => <div>公开作品详情</div>,
}));

describe("PublicImageDetailOverlay", () => {
  it("uses the same full content-area layout as private asset details", () => {
    const { container } = render(
      <PublicImageDetailOverlay
        image={{ id: "image-1" } as GenerationAsset}
        onClose={vi.fn()}
        onImageChange={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveClass(
      "fixed",
      "inset-y-0",
      "right-0",
      "left-0",
      "md:left-[88px]",
      "overflow-hidden",
    );
    expect(container.firstElementChild).not.toHaveClass("bg-black/50", "p-3", "sm:p-6");
    expect(screen.getByText("公开作品详情")).toBeInTheDocument();
  });
});
