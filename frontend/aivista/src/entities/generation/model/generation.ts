export type GenerationTaskStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" | "CANCELLED";

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

export type GenerationConsent = {
  policyVersion: string;
  policyContent: string;
  consented: boolean;
  consentedAt: string | null;
};

export type GenerationAsset = {
  id: string;
  url: string;
  urlExpiresAt: string;
  width: number;
  height: number;
  createdAt: string;
  finalPrompt: string;
  finalNegativePrompt: string | null;
  requestedImageCount: number;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};
