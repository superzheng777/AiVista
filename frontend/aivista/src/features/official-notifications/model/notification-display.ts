import type { NotificationViolation, OfficialNotification, OfficialNotificationEventType } from "@/entities/notification/model/notification";

const eventTypeLabels: Record<OfficialNotificationEventType, string> = {
  PUBLICATION_APPROVED: "发布已通过",
  PUBLICATION_REJECTED: "发布未通过",
  PUBLICATION_FAILED: "发布失败",
};

export function notificationEventLabel(eventType: OfficialNotificationEventType): string {
  return eventTypeLabels[eventType];
}

const violationMessages: Record<string, string> = {
  SENSITIVE_INFO: "包含个人敏感信息",
  CONTENT_POLICY: "包含可能违规的内容",
};

/** 将审核拒绝原因转换为面向用户的安全提示文案。 */
export function violationText(violations: NotificationViolation[]): string {
  if (!violations.length) return "";
  const parts = violations.map((violation) => {
    const fieldName = violation.field === "title" ? "标题" : "描述";
    return `${fieldName}${violationMessages[violation.reasonCode] ?? "存在不安全内容"}`;
  });
  return `安全提示：${parts.join("；")}，请修改后重新提交。`;
}

export function isPublicationRejected(notification: OfficialNotification): boolean {
  return notification.eventType === "PUBLICATION_REJECTED";
}

export function isPublicationFailed(notification: OfficialNotification): boolean {
  return notification.eventType === "PUBLICATION_FAILED";
}
