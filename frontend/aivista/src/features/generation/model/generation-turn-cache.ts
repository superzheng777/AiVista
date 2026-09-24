import type { InfiniteData } from "@tanstack/react-query";

import type { GenerationTurn } from "@/entities/generation/model/generation";
import type { GenerationTaskUpdateEvent } from "@/features/generation/model/generation-event-stream-parsing";
import type { CreationForm } from "@/entities/generation/model/generation";

export type GenerationTurnPage = { items: GenerationTurn[]; nextBefore: string | null; hasMore: boolean };

export function mergeGenerationTurnPages(
  current: InfiniteData<GenerationTurnPage> | undefined,
  incoming: InfiniteData<GenerationTurnPage>,
): InfiniteData<GenerationTurnPage> {
  if (!current) return incoming;
  const currentTasks = new Map<string, GenerationTurn["generations"][number]>();
  const currentTurns = new Map<string, GenerationTurn>();
  for (const page of current.pages)
    for (const turn of page.items) {
      currentTurns.set(turn.id, turn);
      for (const task of turn.generations) currentTasks.set(task.id, task);
    }
  return {
    ...incoming,
    pages: incoming.pages.map((page) => ({
      ...page,
      items: page.items.map((turn) => {
        const generations = turn.generations.map((task) => {
          const currentTask = currentTasks.get(task.id);
          return currentTask && currentTask.version > task.version ? currentTask : task;
        });
        const existing = currentTurns.get(turn.id);
        return existing && existing.revision > turn.revision
          ? {
              ...turn,
              status: existing.status,
              revision: existing.revision,
              forms: existing.forms,
              activities: existing.activities,
              assistantMessage: existing.assistantMessage,
              generations,
            }
          : { ...turn, generations };
      }),
    })),
  };
}

export function applyAgentFormUpdateToTurns(
  current: InfiniteData<GenerationTurnPage> | undefined,
  creationId: string,
  revision: number,
  form: CreationForm,
  status: "RUNNING" | "WAITING_INPUT",
): InfiniteData<GenerationTurnPage> | undefined {
  if (!current) return current;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((turn) => {
        if (turn.id !== creationId || revision < turn.revision) return turn;
        const existing = turn.forms.findIndex((item) => item.id === form.id);
        const forms =
          existing < 0 ? [...turn.forms, form] : turn.forms.map((item, index) => (index === existing ? form : item));
        return { ...turn, revision, status, forms };
      }),
    })),
  };
}

export function mergeGenerationTurnPageData(oldData: unknown, newData: unknown): unknown {
  return mergeGenerationTurnPages(
    oldData as InfiniteData<GenerationTurnPage> | undefined,
    newData as InfiniteData<GenerationTurnPage>,
  );
}

export function applyGenerationTaskUpdateToTurns(
  current: InfiniteData<GenerationTurnPage> | undefined,
  event: GenerationTaskUpdateEvent,
): InfiniteData<GenerationTurnPage> | undefined {
  if (!current) return current;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((turn) => {
        let changed = false;
        const generations = turn.generations.map((task) => {
          if (task.id !== event.generationTaskId || event.revision <= task.version) return task;
          changed = true;
          return {
            ...task,
            status: event.status,
            version: event.revision,
            retryCount: event.retryCount,
            maxRetryCount: event.maxRetryCount,
          };
        });
        return changed ? { ...turn, generations } : turn;
      }),
    })),
  };
}
