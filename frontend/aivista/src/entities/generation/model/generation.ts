export type GenerationTaskStatus = "QUEUED" | "RUNNING" | "TRANSFERRING" | "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" | "CANCELLED";

export function isActiveGenerationStatus(status: GenerationTaskStatus): boolean {
  return status === "QUEUED" || status === "RUNNING" || status === "TRANSFERRING";
}

/** 发布流程状态。`NONE` 表示从未提交或撤销发布后的初始状态。 */
export type PublicationReviewStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "FAILED";

export type GenerationImage = {
  id: string;
  sourceIndex: number;
  url: string | null;
  urlExpiresAt: string | null;
  width: number;
  height: number;
};

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
  cancelledImageCount: number;
  failureCode: string | null;
  failureMessage: string | null;
  images: GenerationImage[];
  createdAt: string;
  completedAt: string | null;
};

export type GenerationSession = {
  id: string;
  title: string;
  lastMessageAt: string;
  latestTask: Pick<GenerationTask, "id" | "status" | "version"> | null;
};

export type GenerationMessage = {
  id: string;
  sequenceNo: number;
  prompt: string;
  negativePrompt: string | null;
  createdAt: string;
  generation: GenerationTask;
};

export type GenerationAsset = {
  id: string;
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
export type ImageUrls = { thumbnail: ImageUrl | null; display: ImageUrl | null; original: ImageUrl | null };

/** A signed URL only needs renewal once it has actually expired. */
export function needsImageUrlRefresh(imageUrl: ImageUrl | null, now = Date.now()): boolean {
  if (!imageUrl?.expiresAt) return imageUrl === null;
  const expiresAt = Date.parse(imageUrl.expiresAt);
  return Number.isNaN(expiresAt) || expiresAt <= now;
}

/** 资产、个人发布和发现列表共用的后端完整图片 DTO，字段与 `GenerationAssetImageResponse` 对齐。 */
export type GenerationAssetImageDto = {
  imageId: string;
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
