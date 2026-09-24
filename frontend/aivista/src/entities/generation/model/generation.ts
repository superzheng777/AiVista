export type GenerationTaskStatus = "QUEUED" | "GENERATING" | "SAVING" | "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED";

export function isActiveGenerationStatus(status: GenerationTaskStatus): boolean {
  return status === "QUEUED" || status === "GENERATING" || status === "SAVING";
}

/** 发布流程状态。`NONE` 表示从未提交或撤销发布后的初始状态。 */
export type PublicationReviewStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "FAILED";

export type GenerationTask = {
  id: string;
  sessionId: string;
  status: GenerationTaskStatus;
  version: number;
  retryCount: number;
  maxRetryCount: number;
  requestedImageCount: number;
  completedImageCount: number;
  failedImageCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  images: GenerationAsset[];
  createdAt: string;
  completedAt: string | null;
};

type GenerationProgressTask = Pick<GenerationTask, "requestedImageCount" | "completedImageCount" | "failedImageCount">;

/** Image progress comes only from real generation tasks, never from Agent Tool attempts. */
export function generationImageProgress(tasks: readonly GenerationProgressTask[]) {
  const requested = tasks.reduce((total, task) => total + task.requestedImageCount, 0);
  const completed = tasks.reduce((total, task) => total + task.completedImageCount, 0);
  const failed = tasks.reduce((total, task) => total + task.failedImageCount, 0);
  return { completed, failed, total: Math.max(requested, completed + failed) };
}

const SESSION_TITLE_DISPLAY_LENGTH = 10;

/** Keep session titles compact without changing their persisted value. */
export function formatSessionTitle(title: string): string {
  const characters = Array.from(title);
  if (characters.length <= SESSION_TITLE_DISPLAY_LENGTH) return title;
  return `${characters.slice(0, SESSION_TITLE_DISPLAY_LENGTH).join("")}...`;
}

export type GenerationSession = {
  id: string;
  title: string;
  lastMessageAt: string;
  latestTask: Pick<GenerationTask, "id" | "status" | "version"> | null;
  hasActiveTask: boolean;
};

export type ConversationMessage = {
  id: string;
  sequenceNo: number;
  role: "USER" | "ASSISTANT";
  content: string | null;
  createdAt: string;
};

export type GenerationTurn = {
  id: string;
  mode: "NORMAL" | "AGENT";
  status: "RUNNING" | "WAITING_INPUT" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  failureCode: string | null;
  revision: number;
  userMessage: ConversationMessage;
  assistantMessage: ConversationMessage | null;
  normalGenerationRequest: { negativePrompt: string | null } | null;
  generations: GenerationTask[];
  activities: CreationActivity[];
  forms: CreationForm[];
};

export type AgentInputFormOption = { value: string; label: string };
export type AgentInputFormField =
  | { id: string; type: "TEXT"; label: string; required: boolean; value: string; placeholder?: string }
  | {
      id: string;
      type: "SINGLE_SELECT";
      label: string;
      required: boolean;
      value: string;
      options: AgentInputFormOption[];
      allowCustom: boolean;
      customLabel?: string;
    };
export type AgentInputForm = { schemaVersion: 2; title: string; fields: AgentInputFormField[] };
export type CreationForm = {
  id: string;
  status: "PENDING" | "SUBMITTED" | "SKIPPED" | "CANCELLED";
  form: AgentInputForm;
  requestedAt: string;
  resolvedAt: string | null;
};

export type CreationActivity = {
  sequenceNo: number;
  type: "NARRATION" | "SKILL" | "TOOL";
  outcome: "COMPLETED" | "FAILED" | "CANCELLED";
  content: string;
  toolName: string | null;
  generationTaskId: string | null;
  startedAt: string;
  completedAt: string;
};

export type GenerationAsset = {
  id: string;
  sourceIndex: number;
  imageUrls: ImageUrls;
  width: number;
  height: number;
  createdAt: string;
  favorited: boolean;
  finalPrompt: string;
  finalNegativePrompt: string | null;
  requestedImageCount: number;
  promptExtend: boolean;
  publicationReviewStatus: PublicationReviewStatus;
  publicationVersion: number;
  publicAt: string | null;
  title: string | null;
  description: string | null;
  authorId: string;
  likeCount: number;
  likedByCurrentUser: boolean;
};

export type ImageUrl = { url: string; expiresAt: string | null };
/** Original URLs are deliberately absent from normal API responses. */
export type ImageUrls = { thumbnail: ImageUrl | null; display: ImageUrl | null };

/** A signed URL only needs renewal once it has actually expired. */
export function needsImageUrlRefresh(imageUrl: ImageUrl | null, now = Date.now()): boolean {
  if (!imageUrl?.expiresAt) return imageUrl === null;
  const expiresAt = Date.parse(imageUrl.expiresAt);
  return Number.isNaN(expiresAt) || expiresAt <= now;
}

/** 资产、个人发布和发现列表共用的后端完整图片 DTO，字段与 `GenerationAssetImageResponse` 对齐。 */
export type GenerationAssetImageDto = {
  imageId: string;
  sourceIndex: number;
  imageUrls: ImageUrls;
  createdAt: string;
  favorited: boolean;
  finalPrompt: string;
  finalNegativePrompt: string | null;
  generationConfig: { width: number; height: number; requestedImageCount: number; promptExtend: boolean };
  publicationReviewStatus: PublicationReviewStatus;
  publicationVersion: number;
  publicAt: string | null;
  title: string | null;
  description: string | null;
  authorId: string;
  likeCount: number;
  likedByCurrentUser: boolean;
};

export function mapGenerationAssetImage(dto: GenerationAssetImageDto): GenerationAsset {
  return {
    id: dto.imageId,
    sourceIndex: dto.sourceIndex,
    imageUrls: dto.imageUrls,
    width: dto.generationConfig.width,
    height: dto.generationConfig.height,
    createdAt: dto.createdAt,
    favorited: dto.favorited,
    finalPrompt: dto.finalPrompt,
    finalNegativePrompt: dto.finalNegativePrompt,
    requestedImageCount: dto.generationConfig.requestedImageCount,
    promptExtend: dto.generationConfig.promptExtend,
    publicationReviewStatus: dto.publicationReviewStatus,
    publicationVersion: dto.publicationVersion,
    publicAt: dto.publicAt,
    title: dto.title,
    description: dto.description,
    authorId: dto.authorId,
    likeCount: dto.likeCount,
    likedByCurrentUser: dto.likedByCurrentUser,
  };
}

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};
