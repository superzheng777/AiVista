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
    expect(rows()[0]).toHaveTextContent("图像生成（2/2）");
    expect(rows()[1]).toHaveTextContent("查看参考图片（2/4）");
    expect(screen.getByRole("list")).not.toHaveTextContent(/已完成|失败|执行中|已取消/);
    expect(screen.getByRole("list").querySelectorAll("details, button, pre")).toHaveLength(0);
    fireEvent.click(screen.getByText("创作中"));
    expect(screen.getByLabelText("创作过程")).not.toHaveAttribute("open");
  });

  it("groups streamed narration and its tool by message, retaining the step through completion and history", () => {
    const client = new QueryClient();
    const initial = sessionFixture();
    initial.turns[0]!.items = [];
    const key = generationQueryKeys.session("1");
    client.setQueryData(key, initial);
    const items = () => client.getQueryData<SessionDetail>(key)!.turns[0]!.items;
    const { rerender, unmount } = render(<AgentProcess active items={items()} />);
    const receive = (item: SessionItem) => {
      receiveCreationEvent(client, { type: "creation.item.upserted", sessionId: "1", creationId: "2", item });
      rerender(<AgentProcess active items={items()} />);
    };
    const text: SessionItem = {
      id: "text:10:0",
      kind: "text",
      assistantMessageId: "assistant:10",
      phase: "process",
      text: "先确认",
    };
    receive(text);
    const step = rows()[0];
    receive({ ...text, text: "先确认主题和用途。\n\n" });
    receive({ ...tool("f1", "request_user_input", "RUNNING"), assistantMessageId: "assistant:10" });
    receive({ ...tool("f1", "request_user_input", "FAILED"), assistantMessageId: "assistant:10" });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toBe(step);
    expect(step).toHaveTextContent("先确认主题和用途。需求确认");
    receive({ ...tool("f2", "request_user_input"), assistantMessageId: "assistant:20" });
    expect(rows()).toHaveLength(2);
    expect(rows()[1]).not.toHaveTextContent("先确认");
    expect(items().find((item) => item.id === "tool:f1")).toMatchObject({ status: "FAILED" });
    const snapshot = JSON.parse(JSON.stringify(client.getQueryData(key))) as SessionDetail;
    unmount();
    client.clear();
    client.setQueryData(key, hydrateSession(client, snapshot));
    render(<AgentProcess active={false} items={items()} />);
    expect(screen.getByText("已完成")).toBeInTheDocument();
    fireEvent.click(screen.getByText("已完成"));
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent("先确认主题和用途。需求确认");
    expect(rows()[1]).toHaveTextContent("需求确认");
    client.clear();
  });

  it("keeps different messages and missing ownership separate, while preserving multiple text blocks", () => {
    render(
      <AgentProcess
        active
        items={[
          { id: "a", kind: "text", assistantMessageId: "m1", text: "先了解需求。", phase: "process" },
          { id: "b", kind: "text", assistantMessageId: "m1", text: "再确认用途。", phase: "process" },
          { ...tool("r1", "read"), assistantMessageId: "m2" },
          { id: "legacy", kind: "text", text: "历史文字", phase: "process" },
          tool("r2", "read"),
        ]}
      />,
    );
    expect(rows()).toHaveLength(4);
    expect(rows()[0]).toHaveTextContent("先了解需求。再确认用途。");
    expect(rows()[1]).not.toHaveTextContent("先了解需求");
    expect(rows()[2]).toHaveTextContent("历史文字");
    expect(rows()[3]).not.toHaveTextContent("历史文字");
  });

  it.each([
    { label: "process text", item: { id: "text", kind: "text", text: "调整方向", phase: "process" } },
    { label: "final text", item: { id: "text", kind: "text", text: "已完成", phase: "final" } },
    { label: "form", item: form },
    { label: "another tool", item: tool("other", "inspect_image") },
  ] satisfies { label: string; item: SessionItem }[])("does not merge across $label", ({ item }) => {
    render(<AgentProcess active items={[tool("g1", "text_to_image"), item, tool("g2", "text_to_image")]} />);
    expect(screen.getAllByText("图像生成")).toHaveLength(2);
    expect(screen.queryByText("图像生成（2/2）")).not.toBeInTheDocument();
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
    expect(screen.getAllByText("需求确认")).toHaveLength(2);
    expect(screen.getByRole("list")).not.toHaveTextContent(/已完成|失败|执行中|已取消/);
    expect(screen.getByText("图像生成")).toBeVisible();
    expect(screen.getByText("图像生成（2/2）")).toBeVisible();
  });

  it.each([
    { statuses: ["FAILED", "FAILED"], expected: "（0/2）" },
    { statuses: ["CANCELLED", "CANCELLED"], expected: "（0/2）" },
    { statuses: ["SUCCEEDED", "CANCELLED"], expected: "（1/2）" },
    { statuses: ["FAILED", "CANCELLED", "RUNNING"], expected: "（0/3）" },
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
    expect(firstRow).toHaveTextContent("图像生成（1/2）");
    expect(firstRow!.querySelector('[aria-busy="true"]')).not.toBeNull();
    receive(tool("g2", "text_to_image"));
    receive(tool("g2", "text_to_image"));
    receive(tool("g2", "text_to_image", "RUNNING"));
    expect(firstRow).toHaveTextContent("图像生成（2/2）");
    expect(firstRow!.querySelector('[aria-busy="true"]')).toBeNull();
    client.setQueryData(key, hydrateSession(client, initial));
    rerender(<AgentProcess active items={items()} />);
    expect(firstRow).toHaveTextContent("图像生成（2/2）");
    const snapshot = JSON.parse(JSON.stringify(client.getQueryData<SessionDetail>(key))) as SessionDetail;
    expect(snapshot.turns[0]!.items).toHaveLength(2);
    unmount();
    client.clear();
    client.setQueryData(key, hydrateSession(client, snapshot));
    render(<AgentProcess active items={items()} />);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("图像生成（2/2）");
    client.clear();
  });

  it.each(["SUCCEEDED", "FAILED", "CANCELLED"] as const)("stops activity when a tool becomes %s", (status) => {
    const { rerender } = render(<AgentProcess active items={[tool("r1", "read", "RUNNING")]} />);
    expect(rows()[0]!.querySelector('[aria-busy="true"]')).not.toBeNull();
    rerender(<AgentProcess active items={[tool("r1", "read", status)]} />);
    expect(rows()[0]!.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("stops activity when execution pauses or ends, even before a tool update arrives", () => {
    const items = [tool("r1", "read", "RUNNING")];
    const { rerender } = render(<AgentProcess active items={items} />);
    expect(rows()[0]!.querySelector('[aria-busy="true"]')).not.toBeNull();
    rerender(<AgentProcess active={false} items={items} />);
    expect(rows()[0]!.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
