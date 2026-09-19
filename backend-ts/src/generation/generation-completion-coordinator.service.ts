import { Injectable } from "@nestjs/common";
import type { GenerationCompletionResponse } from "./generation-completion-client.service.js";

type Waiter = {
  resolve(value: GenerationCompletionResponse): void;
  reject(reason: unknown): void;
  removeAbortListener(): void;
};

/** Single-process bridge from a committed Generation completion back to a waiting Agent Tool. */
@Injectable()
export class GenerationCompletionCoordinatorService {
  private readonly waiters = new Map<string, Waiter>();
  private readonly earlyResults = new Map<string, GenerationCompletionResponse>();
  private readonly abandoned = new Set<string>();

  wait(taskId: string, signal?: AbortSignal): Promise<GenerationCompletionResponse> {
    const early = this.earlyResults.get(taskId);
    if (early) {
      this.earlyResults.delete(taskId);
      return Promise.resolve(early);
    }
    if (signal?.aborted) {
      this.rememberAbandoned(taskId);
      return Promise.reject(abortError());
    }
    if (this.waiters.has(taskId)) {
      throw new Error(`A Generation Tool is already waiting for task ${taskId}`);
    }
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.remove(taskId);
        this.rememberAbandoned(taskId);
        reject(abortError());
      };
      const waiter: Waiter = {
        resolve,
        reject,
        removeAbortListener: () => signal?.removeEventListener("abort", abort),
      };
      this.waiters.set(taskId, waiter);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }

  complete(result: GenerationCompletionResponse): void {
    if (this.abandoned.delete(result.generationTaskId)) return;
    const waiter = this.waiters.get(result.generationTaskId);
    if (!waiter) {
      this.earlyResults.set(result.generationTaskId, result);
      if (this.earlyResults.size > 1_000) {
        const oldest = this.earlyResults.keys().next().value as string | undefined;
        if (oldest) this.earlyResults.delete(oldest);
      }
      return;
    }
    this.waiters.delete(result.generationTaskId);
    waiter.removeAbortListener();
    waiter.resolve(result);
  }

  private rememberAbandoned(taskId: string): void {
    this.abandoned.add(taskId);
    if (this.abandoned.size > 1_000) {
      const oldest = this.abandoned.values().next().value as string | undefined;
      if (oldest) this.abandoned.delete(oldest);
    }
  }

  private remove(taskId: string): void {
    const waiter = this.waiters.get(taskId);
    waiter?.removeAbortListener();
    this.waiters.delete(taskId);
  }
}

function abortError(): DOMException {
  return new DOMException("Agent generation wait was aborted", "AbortError");
}
