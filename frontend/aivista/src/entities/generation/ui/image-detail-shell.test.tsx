import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GenerationAsset } from "@/entities/generation/model/generation";
import { ImageDetailShell } from "./image-detail-shell";

const image = {
  id: "1",
  sourceIndex: 0,
  imageUrls: { thumbnail: null, display: null },
  width: 1024,
  height: 1024,
  createdAt: "2026-01-01T00:00:00Z",
  favorited: false,
  finalPrompt: "prompt",
  finalNegativePrompt: null,
  requestedImageCount: 1,
  promptExtend: true,
  publicationReviewStatus: "NONE",
  publicationVersion: 0,
  publicAt: null,
  title: "作品",
  description: null,
  authorId: "7",
  likeCount: 0,
  likedByCurrentUser: false,
} satisfies GenerationAsset;

describe("ImageDetailShell navigation", () => {
  it("uses the same close action for the back button and image surround", () => {
    const onClose = vi.fn();
    const { container } = render(<ImageDetailShell image={image} onClose={onClose} />);

    const imageRegion = container.querySelector("section > div")!;
    const aside = container.querySelector("aside")!;
    const backButton = screen.getByRole("button", { name: "返回上一级" });

    expect(imageRegion).toContainElement(backButton);
    expect(aside).not.toContainElement(backButton);

    fireEvent.click(backButton);
    fireEvent.click(imageRegion);

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders icon-only previous and next controls with accessible names", () => {
    render(
      <ImageDetailShell
        image={image}
        onClose={vi.fn()}
        navigation={{
          hasPrevious: true,
          hasNext: false,
          pending: false,
          previous: vi.fn(),
          next: vi.fn(),
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "上一张作品" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下一张作品" })).toBeDisabled();
    expect(screen.queryByText("上一张作品")).not.toBeInTheDocument();
    expect(screen.queryByText("下一张作品")).not.toBeInTheDocument();
  });

  it("constrains long details to the viewport and scrolls the information panel", () => {
    const longPrompt = "很长的提示词".repeat(200);
    const { container } = render(<ImageDetailShell image={{ ...image, finalPrompt: longPrompt }} onClose={vi.fn()} />);

    expect(container.firstElementChild).toHaveClass("h-dvh", "max-h-full", "overflow-hidden");
    expect(container.querySelector("aside")).toHaveClass("min-h-0", "overflow-y-auto");
    expect(screen.getByText(longPrompt)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "本次生成" })).toBeInTheDocument();
  });

  it("stacks the image and details on narrow viewports", () => {
    const { container } = render(<ImageDetailShell image={image} onClose={vi.fn()} />);

    expect(container.firstElementChild).toHaveClass(
      "grid-cols-1",
      "grid-rows-[minmax(0,1fr)_minmax(0,1fr)]",
      "md:grid-cols-[minmax(0,1fr)_380px]",
      "md:grid-rows-1",
    );
    expect(container.querySelector("section > div")).toHaveClass("min-h-0");
    expect(container.querySelector("aside")).toHaveClass("border-t", "md:border-l", "md:border-t-0");
  });

  it("labels both prompt types and preserves the submitted text", () => {
    const positivePrompt = "三只小动物围坐在树桩旁喝茶，保留原始数量和关系。";
    const negativePrompt = "text, watermark, duplicate animals";
    render(
      <ImageDetailShell
        image={{ ...image, finalPrompt: positivePrompt, finalNegativePrompt: negativePrompt }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "正向提示词" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "负向提示词" })).toBeInTheDocument();
    expect(screen.getByText(positivePrompt)).toHaveTextContent(positivePrompt);
    expect(screen.getByText(negativePrompt)).toHaveTextContent(negativePrompt);
  });

  it("omits the negative prompt section when none was submitted", () => {
    render(<ImageDetailShell image={image} onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "正向提示词" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "负向提示词" })).not.toBeInTheDocument();
  });

  it("can move download and time metadata into a public-detail toolbar", () => {
    const { container } = render(<ImageDetailShell image={image} onClose={vi.fn()} showTimeInInfo={false} />);

    expect(screen.queryByRole("button", { name: "下载" })).not.toBeInTheDocument();
    expect(screen.queryByText("生成时间")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回上一级" })).toBeInTheDocument();
    expect(container.querySelector("aside > .sticky")).not.toBeInTheDocument();
  });

  it("delegates original-image download to the owning feature", () => {
    const onDownload = vi.fn();
    render(<ImageDetailShell image={image} onClose={vi.fn()} onDownload={onDownload} />);

    fireEvent.click(screen.getByRole("button", { name: "下载" }));

    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});
