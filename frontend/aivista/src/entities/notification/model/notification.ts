/** 官方消息类型。当前仅发布终态三类；后续迭代新增类型时扩展。 */
import type { GenerationAsset } from "@/entities/generation/model/generation";

export type OfficialNotificationEventType = "PUBLICATION_APPROVED" | "PUBLICATION_REJECTED" | "PUBLICATION_FAILED";

/** 审核拒绝原因。`field` 仅可能为标题或描述，`reasonCode` 为安全原因码。 */
export type NotificationViolation = {
  field: "title" | "description";
  reasonCode: string;
};

/** 官方消息领域模型。签名 URL、供应商原始分类或异常栈不进入此模型。 */
export type OfficialNotification = {
  id: string;
  eventType: OfficialNotificationEventType;
  /** 业务值缺失时（与官方消息无关的保留类型）为 null；UI 据此决定是否提供“查看图片”。 */
  image: GenerationAsset | null;
  title: string;
  content: string;
  violations: NotificationViolation[];
  readAt: string | null;
  createdAt: string;
};

export type InteractionNotification = {
  id: string;
  eventType: "IMAGE_LIKED" | "USER_FOLLOWED";
  actor: { userId: string; nickname: string; avatarUrl: string | null };
  image: GenerationAsset | null;
  readAt: string | null;
  createdAt: string;
};
