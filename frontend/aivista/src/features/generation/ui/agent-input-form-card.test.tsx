import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CreationForm } from "@/entities/generation/model/generation";
import { AgentInputFormCard } from "@/features/generation/ui/agent-input-form-card";

describe("AgentInputFormCard", () => {
  it("prefills model suggestions and submits the filled form document", () => {
    const onResolve = vi.fn();
    render(
      <AgentInputFormCard
        value={pendingForm()}
        enabled
        submitting={false}
        cancelling={false}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("关爱流浪猫")).toBeInTheDocument();
    expect(screen.getByDisplayValue("关爱流浪猫")).toHaveAttribute("maxlength", "300");
    expect(screen.getByRole("radio", { name: "温暖纪实" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "自定义" }));
    expect(screen.getByLabelText("视觉风格自定义内容")).toHaveAttribute("maxlength", "300");
    fireEvent.change(screen.getByLabelText("视觉风格自定义内容"), { target: { value: "儿童蜡笔画" } });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));

    expect(onResolve).toHaveBeenCalledWith("SUBMIT", {
      schemaVersion: 2,
      title: "确认海报方向",
      fields: [
        {
          id: "subject",
          type: "TEXT",
          label: "主题",
          required: true,
          value: "关爱流浪猫",
          placeholder: "填写活动主题",
        },
        {
          id: "style",
          type: "SINGLE_SELECT",
          label: "视觉风格",
          required: true,
          value: "儿童蜡笔画",
          options: [
            { value: "WARM", label: "温暖纪实" },
            { value: "FLAT", label: "扁平插画" },
          ],
          allowCustom: true,
          customLabel: "自定义",
        },
      ],
    });
  });

  it("requires every required value before submitting", () => {
    const value = pendingForm();
    value.form.fields[0]!.value = "";
    value.form.fields[1]!.value = "";
    render(
      <AgentInputFormCard
        value={value}
        enabled
        submitting={false}
        cancelling={false}
        onResolve={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "自定义" })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("视觉风格自定义内容")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("填写活动主题"), { target: { value: "关爱流浪猫" } });
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "温暖纪实" }));
    expect(screen.getByRole("button", { name: "确认" })).toBeEnabled();
  });

  it("treats a model value outside the options as the custom selection", () => {
    const value = pendingForm();
    value.form.fields[1]!.value = "低饱和手绘";

    render(
      <AgentInputFormCard
        value={value}
        enabled
        submitting={false}
        cancelling={false}
        onResolve={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: "自定义" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("视觉风格自定义内容")).toHaveValue("低饱和手绘");
  });

  it("persists skip as a distinct user choice", () => {
    const onResolve = vi.fn();
    render(
      <AgentInputFormCard
        value={pendingForm()}
        enabled
        submitting={false}
        cancelling={false}
        onResolve={onResolve}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "跳过" }));

    expect(onResolve).toHaveBeenCalledWith("SKIP", null);
  });

  it("cancels the whole Creation without resolving the form", () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    render(
      <AgentInputFormCard
        value={pendingForm()}
        enabled
        submitting={false}
        cancelling={false}
        onResolve={onResolve}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "取消本次创作" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("disables competing actions while resolving or cancelling", () => {
    const onResolve = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <AgentInputFormCard
        value={pendingForm()}
        enabled
        submitting
        cancelling={false}
        onResolve={onResolve}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("button", { name: "取消本次创作" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "跳过" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "提交中" })).toBeDisabled();

    rerender(
      <AgentInputFormCard
        value={pendingForm()}
        enabled
        submitting={false}
        cancelling
        onResolve={onResolve}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("button", { name: "取消中" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "跳过" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled();
    expect(screen.getByDisplayValue("关爱流浪猫")).toBeDisabled();
  });

  it("renders the immutable submitted summary after refresh", () => {
    const value = pendingForm();
    value.status = "SUBMITTED";
    value.form.fields[0]!.value = "关爱野生小猫";
    value.form.fields[1]!.value = "WARM";
    value.resolvedAt = "2026-09-20T01:01:00Z";

    render(
      <AgentInputFormCard
        value={value}
        enabled={false}
        submitting={false}
        cancelling={false}
        onResolve={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("已处理的需求确认表单")).toHaveTextContent("关爱野生小猫");
    expect(screen.getByLabelText("已处理的需求确认表单")).toHaveTextContent("温暖纪实");
  });

  it("renders a cancelled form as an immutable cancellation summary", () => {
    const value = pendingForm();
    value.status = "CANCELLED";
    value.resolvedAt = "2026-09-20T01:01:00Z";

    render(
      <AgentInputFormCard
        value={value}
        enabled={false}
        submitting={false}
        cancelling={false}
        onResolve={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("已处理的需求确认表单")).toHaveTextContent("本次创作已取消，此表单无需继续填写。");
    expect(screen.queryByRole("button", { name: "取消本次创作" })).not.toBeInTheDocument();
  });
});

function pendingForm(): CreationForm {
  return {
    id: "701",
    status: "PENDING",
    form: {
      schemaVersion: 2,
      title: "确认海报方向",
      fields: [
        {
          id: "subject",
          type: "TEXT",
          label: "主题",
          required: true,
          value: "关爱流浪猫",
          placeholder: "填写活动主题",
        },
        {
          id: "style",
          type: "SINGLE_SELECT",
          label: "视觉风格",
          required: true,
          value: "WARM",
          options: [
            { value: "WARM", label: "温暖纪实" },
            { value: "FLAT", label: "扁平插画" },
          ],
          allowCustom: true,
          customLabel: "自定义",
        },
      ],
    },
    requestedAt: "2026-09-20T01:00:00Z",
    resolvedAt: null,
  };
}
