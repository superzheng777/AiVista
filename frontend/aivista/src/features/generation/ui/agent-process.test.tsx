import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionDetail, SessionItem } from "@/entities/generation/model/session";
import { generationQueryKeys } from "../api/generation-api";
import { hydrateSession, receiveCreationEvent } from "../model/session-events";
import { sessionFixture } from "../model/session-events.test-fixture";
import { AgentProcess } from "./agent-process";

afterEach(cleanup);
type ToolItem = Extract<SessionItem, { kind: "tool" }>;
function tool(id: string, name: string, status: ToolItem["status"] = "SUCCEEDED"): ToolItem {
  return { id: `tool:${id}`, kind: "tool", toolCallId: id, name, status };
}
const image: SessionItem = {
  id: "image-1",
  kind: "generation",
  generationId: "1",
  status: "SUCCEEDED",
  assets: [],
};
const form: SessionItem = {
  id: "form-1",
  kind: "form",
  toolCallId: "form-1",
  status: "SUBMITTED",
  schemaVersion: 2,
  title: "确认需求",
  fields: [],
};
function rows() {
  return within(screen.getByRole("list", { name: "创作步骤" })).getAllByRole("listitem");
}

describe("Agent process tool groups", () => {
  it("collapses consecutive image tools without hiding failures or adding details", () => {
    render(
      <AgentProcess
        active
        items={[
          tool("g1", "text_to_image"),
          image,
          tool("g2", "text_to_image"),
          tool("v1", "inspect_image", "FAILED"),
          tool("v2", "inspect_image", "FAILED"),
          tool("v3", "inspect_image"),
          tool("v4", "inspect_image"),
        ]}
      />,
    );
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent("文生图（2/2）已完成");
    expect(rows()[1]).toHaveTextContent("查看参考图片（2/4）2 次失败");
    expect(screen.getByRole("list").querySelectorAll("details, button, pre")).toHaveLength(0);
    fireEvent.click(screen.getByText("AI 思考过程"));
    expect(screen.getByLabelText("AI 思考过程")).not.toHaveAttribute("open");
  });

  it.each([
    { label: "process text", item: { id: "text", kind: "text", text: "调整方向", phase: "process" } },
    { label: "final text", item: { id: "text", kind: "text", text: "已完成", phase: "final" } },
    { label: "form", item: form },
    { label: "another tool", item: tool("other", "inspect_image") },
  ] satisfies { label: string; item: SessionItem }[])("does not merge across $label", ({ item }) => {
    render(<AgentProcess active items={[tool("g1", "text_to_image"), item, tool("g2", "text_to_image")]} />);
    expect(screen.getAllByText("文生图")).toHaveLength(2);
    expect(screen.queryByText("文生图（2/2）")).not.toBeInTheDocument();
  });

  it("keeps skill and form attempts separate and does not mix text-to-image with image-to-image", () => {
    render(
      <AgentProcess
        active
        items={[
          tool("r1", "read", "FAILED"),
          tool("r2", "read"),
          tool("f1", "request_user_input", "FAILED"),
          tool("f2", "request_user_input"),
          tool("t1", "text_to_image"),
          tool("i1", "image_to_image"),
          tool("i2", "image_to_image"),
        ]}
      />,
    );
    expect(rows()).toHaveLength(6);
    expect(screen.getAllByText("读取技能资料")).toHaveLength(2);
    expect(screen.getAllByText("请求用户确认")).toHaveLength(2);
    expect(screen.getAllByText("失败")).toHaveLength(2);
    expect(screen.getByText("文生图")).toBeVisible();
    expect(screen.getByText("图生图（2/2）")).toBeVisible();
  });

  it.each([
    { statuses: ["FAILED", "FAILED"], expected: "（0/2）失败" },
    { statuses: ["CANCELLED", "CANCELLED"], expected: "（0/2）已取消" },
    { statuses: ["SUCCEEDED", "CANCELLED"], expected: "（1/2）1 次取消" },
    { statuses: ["FAILED", "CANCELLED", "RUNNING"], expected: "（0/3）执行中 · 1 次失败 · 1 次取消" },
  ] satisfies { statuses: ToolItem["status"][]; expected: string }[])(
    "preserves outcome counts: $expected",
    ({ statuses, expected }) => {
      render(<AgentProcess active items={statuses.map((status, i) => tool(`${i}`, "inspect_image", status))} />);
      expect(rows()).toHaveLength(1);
      expect(rows()[0]).toHaveTextContent(`查看参考图片${expected}`);
    },
  );

  it("updates one row through real cache upserts and renders the same counts after history hydration", () => {
    const client = new QueryClient();
    const key = generationQueryKeys.session("1");
    const initial = sessionFixture();
    initial.turns[0]!.items = [tool("g1", "text_to_image")];
    client.setQueryData(key, hydrateSession(client, initial));
    const items = () => client.getQueryData<SessionDetail>(key)!.turns[0]!.items;
    const { rerender, unmount } = render(<AgentProcess active items={items()} />);
    const firstRow = rows()[0];
    const receive = (item: SessionItem) => {
      receiveCreationEvent(client, { type: "creation.item.upserted", sessionId: "1", creationId: "2", item });
      rerender(<AgentProcess active items={items()} />);
    };
    receive(tool("g2", "text_to_image", "RUNNING"));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toBe(firstRow);
    expect(firstRow).toHaveTextContent("文生图（1/2）执行中");
    receive(tool("g2", "text_to_image"));
    receive(tool("g2", "text_to_image"));
    receive(tool("g2", "text_to_image", "RUNNING"));
    expect(firstRow).toHaveTextContent("文生图（2/2）已完成");
    client.setQueryData(key, hydrateSession(client, initial));
    rerender(<AgentProcess active items={items()} />);
    expect(firstRow).toHaveTextContent("文生图（2/2）已完成");
    const snapshot = JSON.parse(JSON.stringify(client.getQueryData<SessionDetail>(key))) as SessionDetail;
    expect(snapshot.turns[0]!.items).toHaveLength(2);
    unmount();
    client.clear();
    client.setQueryData(key, hydrateSession(client, snapshot));
    render(<AgentProcess active items={items()} />);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("文生图（2/2）已完成");
    client.clear();
  });
});
