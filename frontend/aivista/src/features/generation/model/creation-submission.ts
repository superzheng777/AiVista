import { getApiErrorCode } from "@/shared/api/api-response";
import { type CreateAgentCreationInput, type CreateGenerationTaskInput } from "../api/generation-api";
import { type GenerationFormValues } from "./generation-form";

export type CreationSubmission =
  { mode: "image"; input: CreateGenerationTaskInput } | { mode: "agent"; input: CreateAgentCreationInput };

export type SubmissionFeedback = {
  message: string;
  retryable: boolean;
  requiresConsent?: boolean;
};

function inputOf(values: GenerationFormValues, inputAssetIds: string[], sessionId?: string): CreateGenerationTaskInput {
  return {
    sessionId,
    prompt: values.prompt,
    inputAssetIds: inputAssetIds.length ? inputAssetIds : undefined,
    negativePrompt: values.negativePrompt || undefined,
    aspectRatio: values.aspectRatio,
    promptExtend: values.promptExtend,
    imageCount: values.imageCount,
  };
}

export function submissionOf(
  values: GenerationFormValues,
  inputAssetIds: string[],
  sessionId?: string,
): CreationSubmission {
  if (values.mode === "agent") {
    return {
      mode: "agent",
      input: {
        sessionId,
        prompt: values.prompt,
        inputAssetIds: inputAssetIds.length ? inputAssetIds : undefined,
        aspectRatio: values.agentAspectRatio,
        imageCount: values.agentImageCount,
      },
    };
  }
  return { mode: "image", input: inputOf(values, inputAssetIds, sessionId) };
}

export function feedbackFromCreateError(error: unknown): SubmissionFeedback {
  const code = getApiErrorCode(error);
  if (code === 40902 || code === 40903)
    return { message: "生成规则已更新，请重新确认后再提交。", retryable: false, requiresConsent: true };
  if (code === 40908) return { message: "当前会话仍在创作中，请等待完成或先停止 Agent。", retryable: false };
  if (code === 40911) return { message: "当前会话已达到30轮创作上限，请开启新会话。", retryable: false };
  if (code === 42900) return { message: "请求过于频繁，请稍后重试。", retryable: true };
  if (code === 50000) return { message: "系统繁忙，请稍后重试。", retryable: true };
  return { message: "创建任务时发生网络或服务异常，请重试。", retryable: true };
}
