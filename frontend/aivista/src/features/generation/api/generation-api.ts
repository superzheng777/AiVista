import type { AgentInputForm } from "@/entities/generation/model/generation";
import type { CreatedCreation, CreationTurn, SessionDetail, SessionSummary, SessionItem } from "@/entities/generation/model/session";
import { browserApiClient } from "@/shared/api/browser-client";
import { type ApiResponse, unwrapApiResponse } from "@/shared/api/api-response";

export type { CreatedCreation } from "@/entities/generation/model/session";
export type CreateGenerationTaskInput = {
  sessionId?: string; prompt: string; inputAssetIds?: string[]; negativePrompt?: string;
  aspectRatio: string; promptExtend: boolean; imageCount: number;
};
export type CreateAgentCreationInput = {
  sessionId?: string; prompt: string; inputAssetIds?: string[];
  aspectRatio: "AUTO" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16"; imageCount: number;
};
export const generationQueryKeys = {
  all: ["generation"] as const,
  sessions: () => ["generation", "sessions"] as const,
  session: (sessionId: string) => ["generation", "session", sessionId] as const,
};
export async function listGenerationSessions(): Promise<SessionSummary[]> {
  return unwrapApiResponse((await browserApiClient.get<ApiResponse<SessionSummary[]>>("/generation-sessions")).data);
}
export async function getGenerationSession(sessionId: string): Promise<SessionDetail> {
  return unwrapApiResponse((await browserApiClient.get<ApiResponse<SessionDetail>>(`/generation-sessions/${sessionId}`)).data);
}
export async function updateGenerationSessionTitle(sessionId: string, title: string): Promise<{ sessionId: string; title: string }> {
  return unwrapApiResponse((await browserApiClient.patch<ApiResponse<{ sessionId: string; title: string }>>(
    `/generation-sessions/${sessionId}`, { title })).data);
}
export async function deleteGenerationSession(sessionId: string): Promise<void> {
  await browserApiClient.delete(`/generation-sessions/${encodeURIComponent(sessionId)}`);
}
export function createGenerationTask(input: CreateGenerationTaskInput): Promise<CreatedCreation> {
  return create("NORMAL", input, { aspectRatio: input.aspectRatio, imageCount: input.imageCount,
    negativePrompt: input.negativePrompt, promptExtend: input.promptExtend });
}
export function createAgentCreation(input: CreateAgentCreationInput): Promise<CreatedCreation> {
  return create("AGENT", input, { aspectRatio: input.aspectRatio === "AUTO" ? undefined : input.aspectRatio,
    imageCount: input.imageCount === 0 ? undefined : input.imageCount });
}
async function create(mode: "NORMAL" | "AGENT", input: { sessionId?: string; prompt: string; inputAssetIds?: string[] },
    settings: Record<string, unknown>): Promise<CreatedCreation> {
  return unwrapApiResponse((await browserApiClient.post<ApiResponse<CreatedCreation>>("/creations", {
    sessionId: input.sessionId, mode, input: { prompt: input.prompt, assetIds: input.inputAssetIds ?? [] }, settings,
  })).data);
}
export async function cancelCreation(creationId: string): Promise<Pick<CreationTurn, "creationId" | "status" | "revision">> {
  return unwrapApiResponse((await browserApiClient.put<ApiResponse<Pick<CreationTurn, "creationId" | "status" | "revision">>>(
    `/creations/${creationId}/cancellation`, {})).data);
}
export async function resolveAgentForm(input: { creationId: string; toolCallId: string; expectedRevision: number;
    action: "SUBMITTED" | "SKIPPED"; form: AgentInputForm | null }): Promise<{
      creationId: string; revision: number; status: CreationTurn["status"]; item: SessionItem;
    }> {
  return unwrapApiResponse((await browserApiClient.put<ApiResponse<{
    creationId: string; revision: number; status: CreationTurn["status"]; item: SessionItem;
  }>>(`/creations/${input.creationId}/forms/${encodeURIComponent(input.toolCallId)}/response`, {
    expectedRevision: input.expectedRevision, action: input.action,
    ...(input.form ? { values: Object.fromEntries(input.form.fields.map((field) => [field.id, field.value])) } : {}),
  })).data);
}
