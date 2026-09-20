import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CreationForm } from "@/entities/generation/model/generation";
import { AgentInputFormCard } from "@/features/generation/ui/agent-input-form-card";

describe("AgentInputFormCard", () => {
  it("prefills model suggestions and submits the typed answer object", () => {
    const onResolve = vi.fn();
    render(<AgentInputFormCard value={pendingForm()} enabled submitting={false} onResolve={onResolve} />);

    expect(screen.getByDisplayValue("关爱流浪猫")).toBeInTheDocument();
    expect(screen.getByDisplayValue("关爱流浪猫")).toHaveAttribute("maxlength", "300");
    expect(screen.getByRole("radio", { name: "温暖纪实" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "自定义" }));
    expect(screen.getByLabelText("视觉风格自定义内容")).toHaveAttribute("maxlength", "300");
    fireEvent.change(screen.getByLabelText("视觉风格自定义内容"), { target: { value: "儿童蜡笔画" } });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));

    expect(onResolve).toHaveBeenCalledWith("SUBMIT", {
      subject: { kind: "TEXT", value: "关爱流浪猫" },
      style: { kind: "CUSTOM", value: "儿童蜡笔画" },
    });
  });

  it("persists skip as a distinct user choice", () => {
    const onResolve = vi.fn();
    render(<AgentInputFormCard value={pendingForm()} enabled submitting={false} onResolve={onResolve} />);

    fireEvent.click(screen.getByRole("button", { name: "跳过" }));

    expect(onResolve).toHaveBeenCalledWith("SKIP", null);
  });

  it("renders the immutable submitted summary after refresh", () => {
    const value = pendingForm();
    value.status = "SUBMITTED";
    value.answers = {
      subject: { kind: "TEXT", value: "关爱野生小猫" },
      style: { kind: "OPTION", value: "WARM" },
    };
    value.resolvedAt = "2026-09-20T01:01:00Z";

    render(<AgentInputFormCard value={value} enabled={false} submitting={false} onResolve={vi.fn()} />);

    expect(screen.getByLabelText("已处理的需求确认表单")).toHaveTextContent("关爱野生小猫");
    expect(screen.getByLabelText("已处理的需求确认表单")).toHaveTextContent("温暖纪实");
  });
});

function pendingForm(): CreationForm {
  return {
    id: "701",
    status: "PENDING",
    form: {
      schemaVersion: 1,
      title: "确认海报方向",
      fields: [
        { id: "subject", type: "TEXT", label: "主题", required: true,
          initialValue: "关爱流浪猫", placeholder: "填写活动主题" },
        { id: "style", type: "SINGLE_SELECT", label: "视觉风格", required: true,
          initialValue: "WARM", options: [
            { value: "WARM", label: "温暖纪实" },
            { value: "FLAT", label: "扁平插画" },
          ], allowCustom: true, customLabel: "自定义", customInitialValue: "" },
      ],
    },
    answers: null,
    requestedAt: "2026-09-20T01:00:00Z",
    resolvedAt: null,
  };
}
