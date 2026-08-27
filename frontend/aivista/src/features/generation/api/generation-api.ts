import { mapGenerationAssetImage } from "@/entities/generation/model/generation";
import type {
  CursorPage,
  GenerationAsset,
  GenerationAssetImageDto,
  GenerationMessage,
  GenerationSession,
  GenerationTask,
  GenerationTaskStatus,
} from "@/entities/generation/model/generation";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

type GenerationTaskDto = { taskId: string; sessionId: string; status: GenerationTaskStatus; taskVersion: number; retryCount: number; maxRetryCount: number; requestedImageCount: number; completedImageCount: number; failedImageCount: number; cancelledImageCount: number; failureCode: string | null; failureMessage: string | null; images: GenerationAssetImageDto[]; createdAt: string; completedAt: string | null };
type GenerationSessionDto = { sessionId: string; title: string; lastMessageAt: string; latestTask: { taskId: string; status: GenerationTaskStatus; taskVersion: number } | null };
type UpdatedGenerationSessionDto = { sessionId: string; title: string; createdAt: string; lastMessageAt: string };
type GenerationMessageDto = { message: { messageId: string; sequenceNo: number; prompt: string; negativePrompt: string | null; createdAt: string }; generation: GenerationTaskDto };
type CreatedGenerationTaskDto = Pick<GenerationTaskDto, "taskId" | "sessionId" | "status" | "taskVersion" | "requestedImageCount" | "createdAt">;

export type CreateGenerationTaskInput = { sessionId?: string; prompt: string; inputAssetIds?: string[]; negativePrompt?: string; aspectRatio: string; promptExtend: boolean; imageCount: number };
export type UpdatedGenerationSession = { id: string; title: string; createdAt: string; lastMessageAt: string };

export const generationQueryKeys = {
  all: ["generation"] as const,
  sessions: () => [...generationQueryKeys.all, "sessions"] as const,
  messages: (sessionId: string) => [...generationQueryKeys.all, "session", sessionId, "messages"] as const,
  task: (taskId: string) => [...generationQueryKeys.all, "task", taskId] as const,
};

function toImage(dto: GenerationAssetImageDto): GenerationAsset { return mapGenerationAssetImage(dto); }
function toTask(dto: GenerationTaskDto): GenerationTask {
  return { id: dto.taskId, sessionId: dto.sessionId, status: dto.status, version: dto.taskVersion, retryCount: dto.retryCount, maxRetryCount: dto.maxRetryCount, requestedImageCount: dto.requestedImageCount, completedImageCount: dto.completedImageCount, failedImageCount: dto.failedImageCount, cancelledImageCount: dto.cancelledImageCount, failureCode: dto.failureCode, failureMessage: dto.failureMessage, images: dto.images.map(toImage), createdAt: dto.createdAt, completedAt: dto.completedAt };
}
function toSession(dto: GenerationSessionDto): GenerationSession { return { id: dto.sessionId, title: dto.title, lastMessageAt: dto.lastMessageAt, latestTask: dto.latestTask && { id: dto.latestTask.taskId, status: dto.latestTask.status, version: dto.latestTask.taskVersion } }; }
function toUpdatedSession(dto: UpdatedGenerationSessionDto): UpdatedGenerationSession { return { id: dto.sessionId, title: dto.title, createdAt: dto.createdAt, lastMessageAt: dto.lastMessageAt }; }

export async function listGenerationSessions(cursor?: string): Promise<CursorPage<GenerationSession>> { const response = await browserApiClient.get<ApiResponse<{ items: GenerationSessionDto[]; nextCursor: string | null }>>("/generation-sessions", { params: { cursor, limit: 20 } }); const data = unwrapApiResponse(response.data); return { items: data.items.map(toSession), nextCursor: data.nextCursor }; }
export async function listGenerationMessages(sessionId: string, before?: string): Promise<{ items: GenerationMessage[]; nextBefore: string | null; hasMore: boolean }> { const response = await browserApiClient.get<ApiResponse<{ items: GenerationMessageDto[]; nextBefore: string | null; hasMore: boolean }>>(`/generation-sessions/${sessionId}/messages`, { params: { before, limit: 5 } }); const data = unwrapApiResponse(response.data); return { items: data.items.map(({ message, generation }) => ({ id: message.messageId, sequenceNo: message.sequenceNo, prompt: message.prompt, negativePrompt: message.negativePrompt, createdAt: message.createdAt, generation: toTask(generation) })), nextBefore: data.nextBefore, hasMore: data.hasMore }; }
export async function updateGenerationSessionTitle(sessionId: string, title: string): Promise<UpdatedGenerationSession> { const response = await browserApiClient.patch<ApiResponse<UpdatedGenerationSessionDto>>(`/generation-sessions/${sessionId}`, { title }); return toUpdatedSession(unwrapApiResponse(response.data)); }
export async function createGenerationTask(input: CreateGenerationTaskInput, idempotencyKey: string): Promise<Pick<GenerationTask, "id" | "sessionId" | "status" | "version" | "requestedImageCount" | "createdAt">> { const response = await browserApiClient.post<ApiResponse<CreatedGenerationTaskDto>>("/generation-tasks", input, { headers: { "Idempotency-Key": idempotencyKey } }); const data = unwrapApiResponse(response.data); return { id: data.taskId, sessionId: data.sessionId, status: data.status, version: data.taskVersion, requestedImageCount: data.requestedImageCount, createdAt: data.createdAt }; }
export async function getGenerationTask(taskId: string): Promise<GenerationTask> { const response = await browserApiClient.get<ApiResponse<GenerationTaskDto>>(`/generation-tasks/${taskId}`); return toTask(unwrapApiResponse(response.data)); }
export async function cancelGenerationTask(taskId: string): Promise<GenerationTask> { const response = await browserApiClient.post<ApiResponse<GenerationTaskDto>>(`/generation-tasks/${taskId}/cancel`); return toTask(unwrapApiResponse(response.data)); }
