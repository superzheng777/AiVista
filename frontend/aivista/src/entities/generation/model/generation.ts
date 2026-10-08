export type PublicationReviewStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "FAILED";

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
