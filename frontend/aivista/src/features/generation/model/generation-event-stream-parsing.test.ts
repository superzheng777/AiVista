import { describe, expect, it, vi } from "vitest";

import {
  consumeSseStream,
  isPublicationStatusUpdateEvent,
  isTaskUpdateEvent,
  applyAgentRealtimeEvent,
  isAgentRealtimeEvent,
  agentFormFromEvent,
  isTerminalStatus,
  parseSseBlock,
  reconnectDelayMs,
} from "@/features/generation/model/generation-event-stream-parsing";

describe("parseSseBlock", () => {
  it("解析事件名与单行 data", () => {
    expect(parseSseBlock('event: publication.updated\ndata: {"imageId":"img-1"}')).toEqual({
      eventName: "publication.updated",
      data: '{"imageId":"img-1"}',
    });
  });

  it("多行 data 以换行拼接,没有 data 行返回 null", () => {
    expect(parseSseBlock("event: m\ndata: line1\ndata: line2")).toEqual({
      eventName: "m",
      data: "line1\nline2",
    });
    expect(parseSseBlock("event: ready\n:comment")).toBeNull();
  });

  it("无 event 行时默认为 message", () => {
    expect(parseSseBlock("data: hello")).toEqual({ eventName: "message", data: "hello" });
  });
});

describe("isTaskUpdateEvent", () => {
  const valid = {
    sessionId: "s1",
    generationTaskId: "t1",
    revision: 3,
    status: "SUCCEEDED",
    retryCount: 0,
    maxRetryCount: 2,
  };

  it("接受合法任务事件", () => {
    expect(isTaskUpdateEvent(valid)).toBe(true);
  });

  it("拒绝缺失字段或非法状态", () => {
    expect(isTaskUpdateEvent({ ...valid, generationTaskId: undefined })).toBe(false);
    expect(isTaskUpdateEvent({ ...valid, revision: "3" })).toBe(false);
    expect(isTaskUpdateEvent({ ...valid, revision: 1.5 })).toBe(false);
    expect(isTaskUpdateEvent({ ...valid, status: "UNKNOWN" })).toBe(false);
    expect(isTaskUpdateEvent({ ...valid, retryCount: -1 })).toBe(false);
    expect(isTaskUpdateEvent(null)).toBe(false);
    expect(isTaskUpdateEvent("payload")).toBe(false);
  });
});

describe("isPublicationStatusUpdateEvent", () => {
  const valid = {
    imageId: "img-1",
    publicationVersion: 2,
    status: "APPROVED",
    publicAt: "2026-08-10T00:00:00Z",
  };

  it("接受合法发布终态事件", () => {
    expect(isPublicationStatusUpdateEvent(valid)).toBe(true);
    expect(isPublicationStatusUpdateEvent({ ...valid, status: "REJECTED", publicAt: null })).toBe(true);
    expect(isPublicationStatusUpdateEvent({ ...valid, status: "FAILED" })).toBe(true);
  });

  it("拒绝非终态、非整数版本号或缺失 imageId", () => {
    expect(isPublicationStatusUpdateEvent({ ...valid, status: "PENDING" })).toBe(false);
    expect(isPublicationStatusUpdateEvent({ ...valid, publicationVersion: 1.5 })).toBe(false);
    expect(isPublicationStatusUpdateEvent({ ...valid, imageId: undefined })).toBe(false);
    expect(isPublicationStatusUpdateEvent({ ...valid, publicAt: 123 })).toBe(false);
  });
});

describe("isTerminalStatus", () => {
  it("识别生成终态", () => {
    for (const status of ["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED"]) {
      expect(isTerminalStatus(status as never)).toBe(true);
    }
    for (const status of ["QUEUED", "GENERATING", "SAVING"]) {
      expect(isTerminalStatus(status as never)).toBe(false);
    }
  });
});

describe("Agent realtime projection", () => {
  const base = {
    creationId: "31",
    sessionId: "9",
    revision: 4,
    streamId: "stream-1",
    sequence: 1,
    eventType: "RUN_STARTED" as const,
    payload: {},
  };

  it("validates, orders and deduplicates deltas within one stream", () => {
    expect(isAgentRealtimeEvent(base)).toBe(true);
    let run = applyAgentRealtimeEvent(undefined, base);
    run = applyAgentRealtimeEvent(run, {
      ...base,
      sequence: 2,
      eventType: "TEXT_DELTA",
      payload: { contentIndex: 0, delta: "正在构图" },
    });
    const duplicate = applyAgentRealtimeEvent(run, {
      ...base,
      sequence: 2,
      eventType: "TEXT_DELTA",
      payload: { contentIndex: 0, delta: "重复" },
    });
    expect(duplicate).toBe(run);
    expect(run.text).toBe("正在构图");
  });

  it("把 Tool 参数兜底产生的创作说明加入实时文本", () => {
    const event = {
      creationId: "creation-1",
      sessionId: "session-1",
      revision: 0,
      streamId: "stream-1",
      sequence: 1,
      eventType: "NARRATION" as const,
      payload: { text: "我会生成四版不同构图的竖版海报。" },
    };
    expect(applyAgentRealtimeEvent(undefined, event).text).toBe("我会生成四版不同构图的竖版海报。");
  });

  it("立即投影模型选择的 Skill", () => {
    const run = applyAgentRealtimeEvent(undefined, {
      ...base,
      sequence: 2,
      eventType: "SKILL_SELECTED",
      payload: { skillName: "poster-design" },
    });
    expect(run.skills).toEqual(["poster-design"]);
  });

  it("accepts Java-owned terminal lifecycle events", () => {
    expect(
      isAgentRealtimeEvent({
        ...base,
        revision: 5,
        sequence: 9,
        eventType: "RUN_FINISHED",
        payload: { status: "SUCCEEDED" },
      }),
    ).toBe(true);
    expect(
      isAgentRealtimeEvent({
        ...base,
        revision: 5,
        sequence: 9,
        eventType: "RUN_CANCELLED",
        payload: { status: "CANCELLED" },
      }),
    ).toBe(true);
  });

  it("extracts the complete persistent form projection from a form event", () => {
    const event = {
      ...base,
      revision: 5,
      streamId: "form-31",
      eventType: "FORM_REQUESTED" as const,
      payload: {
        form: {
          formId: "701",
          status: "PENDING",
          form: {
            schemaVersion: 2,
            title: "确认海报方向",
            fields: [{ id: "subject", type: "TEXT", label: "主题", required: true, value: "关爱流浪猫" }],
          },
          requestedAt: "2026-09-20T01:00:00Z",
          resolvedAt: null,
        },
      },
    };
    expect(isAgentRealtimeEvent(event)).toBe(true);
    expect(agentFormFromEvent(event)).toMatchObject({ id: "701", status: "PENDING", form: { title: "确认海报方向" } });

    const submittedEvent = {
      ...event,
      revision: 6,
      sequence: 2,
      eventType: "FORM_RESOLVED" as const,
      payload: {
        form: {
          ...event.payload.form,
          status: "SUBMITTED",
          form: {
            ...event.payload.form.form,
            fields: [{ id: "subject", type: "TEXT", label: "主题", required: true, value: "关爱野生小猫" }],
          },
          resolvedAt: "2026-09-20T01:01:00Z",
        },
      },
    };
    expect(agentFormFromEvent(submittedEvent)).toMatchObject({
      id: "701",
      status: "SUBMITTED",
      form: { fields: [{ id: "subject", value: "关爱野生小猫" }] },
    });

    const cancelledEvent = {
      ...event,
      revision: 7,
      sequence: 3,
      eventType: "FORM_RESOLVED" as const,
      payload: { form: { ...event.payload.form, status: "CANCELLED", resolvedAt: "2026-09-20T01:01:00Z" } },
    };
    expect(agentFormFromEvent(cancelledEvent)).toMatchObject({ id: "701", status: "CANCELLED" });
  });

  it("rejects malformed form fields instead of trusting nested payloads", () => {
    const event = {
      ...base,
      eventType: "FORM_REQUESTED" as const,
      payload: {
        form: {
          formId: "701",
          status: "PENDING",
          requestedAt: "2026-09-20T01:00:00Z",
          resolvedAt: null,
          form: {
            schemaVersion: 2,
            title: "确认方向",
            fields: [
              {
                id: "style",
                type: "SINGLE_SELECT",
                label: "风格",
                required: true,
                value: "warm",
                allowCustom: false,
                options: [{ value: "warm" }],
              },
            ],
          },
        },
      },
    };
    expect(agentFormFromEvent(event)).toBeNull();

    const validForm = {
      ...event,
      payload: {
        form: {
          ...event.payload.form,
          form: {
            schemaVersion: 2,
            title: "确认方向",
            fields: [
              {
                id: "style",
                type: "SINGLE_SELECT",
                label: "风格",
                required: true,
                value: "unknown",
                allowCustom: false,
                options: [{ value: "warm", label: "温暖" }],
              },
            ],
          },
        },
      },
    };
    expect(agentFormFromEvent(validForm)).toBeNull();

    const missingRequiredValue = {
      ...event,
      eventType: "FORM_RESOLVED" as const,
      payload: {
        form: {
          ...event.payload.form,
          status: "SUBMITTED",
          resolvedAt: "2026-09-20T01:01:00Z",
          form: {
            schemaVersion: 2,
            title: "确认方向",
            fields: [{ id: "subject", type: "TEXT", label: "主题", required: true, value: " " }],
          },
        },
      },
    };
    expect(agentFormFromEvent(missingRequiredValue)).toBeNull();
  });

  it("projects safe Tool lifecycle state", () => {
    let run = applyAgentRealtimeEvent(undefined, base);
    run = applyAgentRealtimeEvent(run, {
      ...base,
      sequence: 2,
      eventType: "TOOL_STARTED",
      payload: { toolCallId: "call-1", toolName: "text_to_image" },
    });
    run = applyAgentRealtimeEvent(run, {
      ...base,
      sequence: 3,
      eventType: "TOOL_FINISHED",
      payload: { toolCallId: "call-1", toolName: "text_to_image", outcome: "SUCCEEDED" },
    });
    expect(run.tools).toEqual([{ toolCallId: "call-1", toolName: "text_to_image", state: "SUCCEEDED" }]);
  });

  it("restores the safe live projection from a reconnect snapshot", () => {
    const run = applyAgentRealtimeEvent(undefined, {
      ...base,
      sequence: 6,
      eventType: "RUN_SNAPSHOT",
      payload: {
        text: "正在生成",
        skills: ["poster-design"],
        tools: [{ toolCallId: "call-1", toolName: "text_to_image", state: "RUNNING" }],
      },
    });
    expect(run).toMatchObject({
      sequence: 6,
      text: "正在生成",
      skills: ["poster-design"],
      tools: [{ toolCallId: "call-1", toolName: "text_to_image", state: "RUNNING" }],
    });
  });

  it("preserves the visible first segment when a submitted form resumes the same Creation", () => {
    let run = applyAgentRealtimeEvent(undefined, base);
    run = applyAgentRealtimeEvent(run, {
      ...base,
      sequence: 2,
      eventType: "TEXT_DELTA",
      payload: { delta: "我先确认一下设计方向。" },
    });
    run = applyAgentRealtimeEvent(run, {
      ...base,
      revision: 6,
      streamId: "stream-2",
      sequence: 1,
      eventType: "RUN_STARTED",
      payload: {},
    });
    run = applyAgentRealtimeEvent(run, {
      ...base,
      revision: 6,
      streamId: "stream-2",
      sequence: 2,
      eventType: "TEXT_DELTA",
      payload: { delta: "现在开始生成。" },
    });

    expect(run.text).toBe("我先确认一下设计方向。现在开始生成。");
  });
});

describe("reconnectDelayMs", () => {
  it("指数退避并封顶 3000ms", () => {
    expect(reconnectDelayMs(1)).toBe(1_000);
    expect(reconnectDelayMs(2)).toBe(2_000);
    expect(reconnectDelayMs(3)).toBe(3_000);
    expect(reconnectDelayMs(10)).toBe(3_000);
  });
});

describe("consumeSseStream", () => {
  function streamOf(blocks: string[]): Response {
    return new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          for (const block of blocks) controller.enqueue(encoder.encode(block));
          controller.close();
        },
      }),
    );
  }

  it("触发 ready,解析 task 与 publication 事件并分发", async () => {
    const onReady = vi.fn();
    const onTaskUpdate = vi.fn();
    const onPublicationUpdate = vi.fn();
    const body = [
      "event: generation.stream.ready\ndata: {}\n\n",
      'event: generation.task.updated\ndata: {"sessionId":"s1","generationTaskId":"t1","revision":1,"status":"SUCCEEDED","retryCount":0,"maxRetryCount":2}\n\n',
      'event: publication.updated\ndata: {"imageId":"img-1","publicationVersion":1,"status":"APPROVED","publicAt":"2026-08-10T00:00:00Z"}\n\n',
    ];
    await consumeSseStream(streamOf(body), onReady, onTaskUpdate, onPublicationUpdate);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onTaskUpdate).toHaveBeenCalledWith(expect.objectContaining({ generationTaskId: "t1", status: "SUCCEEDED" }));
    expect(onPublicationUpdate).toHaveBeenCalledWith(expect.objectContaining({ imageId: "img-1", status: "APPROVED" }));
  });

  it("把 Java 以字符串 ID 输出的 Agent 增量交给前端", async () => {
    const onAgentEvent = vi.fn();
    await consumeSseStream(
      streamOf([
        'event: agent.creation.event\ndata: {"creationId":"1","sessionId":"1","revision":0,"streamId":"stream-1","sequence":1,"eventType":"TEXT_DELTA","payload":{"contentIndex":1,"delta":"正在构图"}}\n\n',
      ]),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      onAgentEvent,
    );
    expect(onAgentEvent).toHaveBeenCalledWith(expect.objectContaining({ creationId: "1", eventType: "TEXT_DELTA" }));
  });

  it("跨 chunk 拼接多行事件,并忽略非法事件与坏 JSON", async () => {
    const onReady = vi.fn();
    const onTaskUpdate = vi.fn();
    const onPublicationUpdate = vi.fn();
    const stream = new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode("event: publication.up"));
          controller.enqueue(encoder.encode('dated\ndata: {"imageId":"img-'));
          controller.enqueue(encoder.encode('2","publicationVersion":1,"status":"FAILED","publicAt":null}\n'));
          controller.enqueue(encoder.encode("\n"));
          controller.enqueue(encoder.encode("event: publication.updated\ndata: not-json\n\n"));
          controller.enqueue(encoder.encode('event: publication.updated\ndata: {"status":"PENDING"}\n\n'));
          controller.close();
        },
      }),
    );
    await consumeSseStream(stream, onReady, onTaskUpdate, onPublicationUpdate);
    expect(onPublicationUpdate).toHaveBeenCalledTimes(1);
    expect(onPublicationUpdate).toHaveBeenCalledWith(expect.objectContaining({ imageId: "img-2", status: "FAILED" }));
    expect(onReady).not.toHaveBeenCalled();
    expect(onTaskUpdate).not.toHaveBeenCalled();
  });

  it("无响应体时抛错", async () => {
    const response = new Response(null);
    await expect(consumeSseStream(response, vi.fn(), vi.fn(), vi.fn())).rejects.toThrow("no response body");
  });
});
