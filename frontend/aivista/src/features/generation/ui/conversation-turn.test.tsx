import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreationTurn } from "@/entities/generation/model/session";
import { ConversationTurn } from "./conversation-turn";

afterEach(cleanup);
const handlers = {
  cancelling: false,
  submittingFormId: null,
  onCancel: vi.fn(),
  onResolve: vi.fn(),
  onOpen: vi.fn(),
  onRefresh: vi.fn(),
  onFavorite: vi.fn(),
  onPublish: vi.fn(),
  onDelete: vi.fn(),
};
function fixture(): CreationTurn {
  return {
    creationId: "1",
    mode: "AGENT",
    status: "SUCCEEDED",
    revision: 4,
    input: { prompt: "制作咖啡海报", assets: [] },
    settings: {},
    createdAt: "2026-10-08T00:00:00Z",
    completedAt: "2026-10-08T00:01:00Z",
    failureCode: null,
    items: [
      { id: "narration", kind: "text", phase: "process", text: "先确认再生成" },
      {
        id: "tool:read",
        kind: "tool",
        toolCallId: "read",
        name: "read",
        skillName: "poster-design",
        status: "SUCCEEDED",
      },
      {
        id: "form",
        kind: "form",
        toolCallId: "form",
        status: "SUBMITTED",
        schemaVersion: 2,
        title: "确认店名",
        fields: [{ id: "name", label: "店名", type: "TEXT", required: true, value: "拾光咖啡" }],
      },
      { id: "final", kind: "text", phase: "final", text: "海报已完成" },
      {
        id: "image",
        kind: "generation",
        status: "SUCCEEDED",
        generationId: "2",
        assets: [{ assetId: "3", url: "https://example.com/image.png", expiresAt: null }],
      },
    ],
  };
}
describe("ConversationTurn regions", () => {
  it("keeps all four regions separate and lets users expand process and submitted form details", () => {
    render(<ConversationTurn turn={fixture()} {...handlers} />);
    const process = screen.getByLabelText("AI 思考过程");
    expect(process).not.toHaveAttribute("open");
    fireEvent.click(within(process).getByText("AI 思考过程"));
    expect(process).toHaveAttribute("open");
    expect(within(process).getByText("先确认再生成")).toBeVisible();
    expect(within(process).queryByText("海报已完成")).not.toBeInTheDocument();
    fireEvent.click(within(process).getByText("读取技能：海报设计"));
    expect(within(process).getByText("读取技能：海报设计")).toBeVisible();
    expect(within(process).getByText("已完成")).toBeVisible();
    expect(process.querySelectorAll("details, button, pre")).toHaveLength(0);
    expect(process.querySelectorAll("summary")).toHaveLength(1);
    expect(within(process).queryByText("工具调用")).not.toBeInTheDocument();
    expect(within(process).queryByText("工具结果")).not.toBeInTheDocument();
    const form = screen.getByLabelText("已处理的需求确认表单");
    expect(form).not.toHaveAttribute("open");
    fireEvent.click(within(form).getByText(/确认店名 · 已填写/));
    expect(within(form).getByText("拾光咖啡")).toBeVisible();
    expect(screen.getByLabelText("AI 最终回复")).toHaveTextContent("海报已完成");
    expect(within(screen.getByLabelText("图片展示区域")).getAllByRole("img")).toHaveLength(1);
  });
  it.each(["SKIPPED", "CANCELLED"] as const)("keeps %s form history collapsible and immutable", (status) => {
    const turn = fixture();
    const form = turn.items.find((item) => item.kind === "form")!;
    form.status = status;
    render(<ConversationTurn turn={turn} {...handlers} />);
    const history = screen.getByLabelText("已处理的需求确认表单");
    expect(history).not.toHaveAttribute("open");
    fireEvent.click(history.querySelector("summary")!);
    expect(history).toHaveAttribute("open");
    expect(within(history).queryByRole("textbox")).not.toBeInTheDocument();
    expect(history).toHaveTextContent(status === "SKIPPED" ? "已跳过" : "已取消");
  });
  it("keeps a pending form actionable while the process can be collapsed during streaming", () => {
    const turn = fixture();
    turn.status = "WAITING_INPUT";
    turn.items = turn.items.filter(
      (item) => item.kind !== "generation" && !(item.kind === "text" && item.phase === "final"),
    );
    const form = turn.items.find((item) => item.kind === "form")!;
    form.status = "PENDING";
    render(<ConversationTurn turn={turn} {...handlers} />);
    expect(screen.getByRole("textbox", { name: "店名" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "跳过" }));
    expect(handlers.onResolve).toHaveBeenCalledWith("form", "SKIP", null);
    expect(screen.queryByLabelText("AI 最终回复")).not.toBeInTheDocument();
  });
  it("shows NORMAL images without agent process or invented final text", () => {
    const turn = fixture();
    turn.mode = "NORMAL";
    turn.items = turn.items.filter((item) => item.kind === "generation");
    render(<ConversationTurn turn={turn} {...handlers} />);
    expect(screen.queryByLabelText("AI 思考过程")).not.toBeInTheDocument();
    expect(screen.getByLabelText("图片展示区域")).toBeInTheDocument();
  });
});
