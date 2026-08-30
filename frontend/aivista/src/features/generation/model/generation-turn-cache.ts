import type { InfiniteData } from "@tanstack/react-query";

import type { GenerationTurn } from "@/entities/generation/model/generation";
import type { GenerationTaskUpdateEvent } from "@/features/generation/model/generation-event-stream-parsing";

export type GenerationTurnPage = { items: GenerationTurn[]; nextBefore: string | null; hasMore: boolean };

export function mergeGenerationTurnPages(
  current: InfiniteData<GenerationTurnPage> | undefined,
  incoming: InfiniteData<GenerationTurnPage>,
): InfiniteData<GenerationTurnPage> {
  if (!current) return incoming;
  const currentTasks = new Map<string, GenerationTurn["generation"]>();
  for (const page of current.pages) for (const turn of page.items) currentTasks.set(turn.generation.id, turn.generation);
  return { ...incoming, pages: incoming.pages.map((page) => ({ ...page, items: page.items.map((turn) => {
    const currentTask = currentTasks.get(turn.generation.id);
    return currentTask && currentTask.version > turn.generation.version ? { ...turn, generation: currentTask } : turn;
  }) })) };
}

export function mergeGenerationTurnPageData(oldData: unknown, newData: unknown): unknown {
  return mergeGenerationTurnPages(oldData as InfiniteData<GenerationTurnPage> | undefined, newData as InfiniteData<GenerationTurnPage>);
}

export function applyGenerationTaskUpdateToTurns(
  current: InfiniteData<GenerationTurnPage> | undefined,
  event: GenerationTaskUpdateEvent,
): InfiniteData<GenerationTurnPage> | undefined {
  if (!current) return current;
  return { ...current, pages: current.pages.map((page) => ({ ...page, items: page.items.map((turn) => {
    if (turn.generation.id !== event.taskId || event.taskVersion <= turn.generation.version) return turn;
    return { ...turn, generation: { ...turn.generation, status: event.status, version: event.taskVersion, retryCount: event.retryCount, maxRetryCount: event.maxRetryCount } };
  }) })) };
}
