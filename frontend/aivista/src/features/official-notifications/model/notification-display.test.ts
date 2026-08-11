import { describe, expect, it } from "vitest";

import type { OfficialNotification } from "@/entities/notification/model/notification";
import {
  isPublicationFailed,
  isPublicationRejected,
  notificationEventLabel,
  violationText,
} from "@/features/official-notifications/model/notification-display";

function notification(overrides: Partial<OfficialNotification>): OfficialNotification {
  return {
    id: "n1",
    eventType: "PUBLICATION_APPROVED",
    image: null,
    title: "标题",
    content: "正文",
    violations: [],
    readAt: null,
    createdAt: "2026-08-10T00:00:00Z",
    ...overrides,
  };
}

describe("notificationEventLabel", () => {
  it("映射三类发布终态标签", () => {
    expect(notificationEventLabel("PUBLICATION_APPROVED")).toBe("发布已通过");
    expect(notificationEventLabel("PUBLICATION_REJECTED")).toBe("发布未通过");
    expect(notificationEventLabel("PUBLICATION_FAILED")).toBe("发布失败");
  });
});

describe("isPublicationRejected / isPublicationFailed", () => {
  it("按 eventType 区分", () => {
    expect(isPublicationRejected(notification({ eventType: "PUBLICATION_REJECTED" }))).toBe(true);
    expect(isPublicationRejected(notification({ eventType: "PUBLICATION_FAILED" }))).toBe(false);
    expect(isPublicationFailed(notification({ eventType: "PUBLICATION_FAILED" }))).toBe(true);
    expect(isPublicationFailed(notification({ eventType: "PUBLICATION_APPROVED" }))).toBe(false);
  });
});

describe("violationText", () => {
  it("无违规返回空串", () => {
    expect(violationText([])).toBe("");
  });

  it("映射字段与原因码", () => {
    expect(violationText([{ field: "title", reasonCode: "SENSITIVE_INFO" }]))
      .toBe("安全提示：标题包含个人敏感信息，请修改后重新提交。");
    expect(violationText([
      { field: "title", reasonCode: "CONTENT_POLICY" },
      { field: "description", reasonCode: "SENSITIVE_INFO" },
    ])).toBe("安全提示：标题包含可能违规的内容；描述包含个人敏感信息，请修改后重新提交。");
  });

  it("未知原因码兜底为“存在不安全内容”", () => {
    expect(violationText([{ field: "description", reasonCode: "UNKNOWN_CODE" }]))
      .toBe("安全提示：描述存在不安全内容，请修改后重新提交。");
  });
});
