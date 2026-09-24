import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/browser-client", () => ({
  browserApiClient: { get: vi.fn(), put: vi.fn() },
}));

import type { AgentInputForm } from "@/entities/generation/model/generation";
import { listGenerationTurns, resolveAgentForm } from "@/features/generation/api/generation-api";
import { browserApiClient } from "@/shared/api/browser-client";

const client = vi.mocked(browserApiClient);

function responseData<T>(data: T): never {
  return { data: { code: 0, message: "ok", data } } as never;
}

const filledForm: AgentInputForm = {
  schemaVersion: 2,
  title: "Logo 设计需求确认",
  fields: [
    { id: "brandName", type: "TEXT", label: "品牌名称", required: true, value: "superZ" },
    {
      id: "personality",
      type: "SINGLE_SELECT",
      label: "品牌性格",
      required: true,
      value: "NATURAL_FRESH",
      options: [
        { value: "NATURAL_FRESH", label: "自然 · 清新" },
        { value: "PRECISE_TECH", label: "精密 · 科技" },
      ],
      allowCustom: true,
    },
  ],
};

describe("generation-api forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits the complete filled form document", async () => {
    client.put.mockResolvedValue(
      responseData({
        creationId: "31",
        revision: 5,
        form: {
          formId: "701",
          status: "SUBMITTED",
          form: filledForm,
          requestedAt: "2026-09-20T01:00:00Z",
          resolvedAt: "2026-09-20T01:01:00Z",
        },
      }),
    );

    const result = await resolveAgentForm({
      creationId: "31",
      formId: "701",
      expectedRevision: 4,
      action: "SUBMIT",
      form: filledForm,
    });

    expect(client.put).toHaveBeenCalledWith("/agent-creations/31/forms/701/response", {
      expectedRevision: 4,
      action: "SUBMIT",
      form: filledForm,
    });
    expect(result.form).toEqual({
      id: "701",
      status: "SUBMITTED",
      form: filledForm,
      requestedAt: "2026-09-20T01:00:00Z",
      resolvedAt: "2026-09-20T01:01:00Z",
    });
  });

  it("sends no filled form when the user skips", async () => {
    client.put.mockResolvedValue(
      responseData({
        creationId: "31",
        revision: 5,
        form: {
          formId: "701",
          status: "SKIPPED",
          form: filledForm,
          requestedAt: "2026-09-20T01:00:00Z",
          resolvedAt: "2026-09-20T01:01:00Z",
        },
      }),
    );

    await resolveAgentForm({
      creationId: "31",
      formId: "701",
      expectedRevision: 4,
      action: "SKIP",
      form: null,
    });

    expect(client.put).toHaveBeenCalledWith("/agent-creations/31/forms/701/response", {
      expectedRevision: 4,
      action: "SKIP",
      form: null,
    });
  });

  it("ignores legacy forms at the REST boundary instead of crashing the conversation", async () => {
    client.get.mockResolvedValue(
      responseData({
        items: [
          turnWithForms([
            {
              formId: "700",
              status: "SUBMITTED",
              form: {
                schemaVersion: 1,
                title: "旧表单",
                fields: [{ id: "brandName", type: "TEXT", label: "品牌名称", required: true }],
              },
              requestedAt: "2026-09-20T01:00:00Z",
              resolvedAt: "2026-09-20T01:01:00Z",
            },
            {
              formId: "701",
              status: "SUBMITTED",
              form: filledForm,
              requestedAt: "2026-09-20T01:00:00Z",
              resolvedAt: "2026-09-20T01:01:00Z",
            },
          ]),
        ],
        nextBefore: null,
        hasMore: false,
      }),
    );

    const result = await listGenerationTurns("12");

    expect(result.items[0]?.forms).toEqual([
      {
        id: "701",
        status: "SUBMITTED",
        form: filledForm,
        requestedAt: "2026-09-20T01:00:00Z",
        resolvedAt: "2026-09-20T01:01:00Z",
      },
    ]);
  });

  it("rejects an invalid pending form instead of leaving a waiting turn without controls", async () => {
    client.get.mockResolvedValue(
      responseData({
        items: [
          turnWithForms([
            {
              formId: "700",
              status: "PENDING",
              form: { schemaVersion: 1, title: "旧表单", fields: [] },
              requestedAt: "2026-09-20T01:00:00Z",
              resolvedAt: null,
            },
          ]),
        ],
        nextBefore: null,
        hasMore: false,
      }),
    );

    await expect(listGenerationTurns("12")).rejects.toThrow("无效的待填写 Agent 表单");
  });
});

function turnWithForms(forms: unknown[]) {
  return {
    creationId: "31",
    mode: "AGENT",
    status: "SUCCEEDED",
    failureCode: null,
    revision: 5,
    userMessage: {
      messageId: "41",
      sequenceNo: 1,
      role: "USER",
      content: "设计 Logo",
      createdAt: "2026-09-20T01:00:00Z",
    },
    assistantMessage: null,
    normalGenerationRequest: null,
    generations: [],
    activities: [],
    forms,
  };
}
