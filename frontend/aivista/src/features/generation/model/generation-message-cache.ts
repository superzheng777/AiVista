import type { InfiniteData } from "@tanstack/react-query";

import type { GenerationMessage } from "@/entities/generation/model/generation";
import type { GenerationTaskUpdateEvent } from "@/features/generation/model/generation-event-stream-parsing";

export type GenerationMessagePage = {
  items: GenerationMessage[];
  nextBefore: string | null;
  hasMore: boolean;
};

/** 保留已收到的更高版本任务状态，避免迟到的 REST 快照将 UI 回退。 */
export function mergeGenerationMessagePages(
  current: InfiniteData<GenerationMessagePage> | undefined,
  incoming: InfiniteData<GenerationMessagePage>,
): InfiniteData<GenerationMessagePage> {
  if (!current) return incoming;

  const currentTasks = new Map<string, GenerationMessage["generation"]>();
  for (const page of current.pages) {
    for (const message of page.items) currentTasks.set(message.generation.id, message.generation);
  }

  return {
    ...incoming,
    pages: incoming.pages.map((page) => ({
      ...page,
      items: page.items.map((message) => {
        const currentTask = currentTasks.get(message.generation.id);
        return currentTask && currentTask.version > message.generation.version
          ? { ...message, generation: currentTask }
          : message;
      }),
    })),
  };
}

/** 适配 React Query 的 structuralSharing 回调；查询层保证传入的是会话消息分页数据。 */
export function mergeGenerationMessagePageData(oldData: unknown, newData: unknown): unknown {
  return mergeGenerationMessagePages(
    oldData as InfiniteData<GenerationMessagePage> | undefined,
    newData as InfiniteData<GenerationMessagePage>,
  );
}

/** 将 SSE 的最小状态事件合并到已加载的会话消息，完整字段仍由下一次 REST 刷新补齐。 */
export function applyGenerationTaskUpdateToMessages(
  current: InfiniteData<GenerationMessagePage> | undefined,
  event: GenerationTaskUpdateEvent,
): InfiniteData<GenerationMessagePage> | undefined {
  if (!current) return current;

  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((message) => {
        if (message.generation.id !== event.taskId || event.taskVersion <= message.generation.version) {
          return message;
        }
        return {
          ...message,
          generation: {
            ...message.generation,
            status: event.status,
            version: event.taskVersion,
            retryCount: event.retryCount,
            maxRetryCount: event.maxRetryCount,
          },
        };
      }),
    })),
  };
}
