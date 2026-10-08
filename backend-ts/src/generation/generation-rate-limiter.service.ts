import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";

type PendingStart = { start: () => void; cancel: () => void };

/** Single-instance request-start limiter; result handling never holds a rate permit. */
@Injectable()
export class GenerationRateLimiterService implements OnModuleDestroy {
  private readonly intervalMs: number;
  // Preserve the previous process's last rate window during a normal restart.
  private nextStartAt = performance.now() + 1000;
  private readonly pending: PendingStart[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(config: ConfigService<Environment, true>) {
    this.intervalMs = 1000 / config.get("AIVISTA_GENERATION_RATE_LIMIT_PER_SECOND", { infer: true });
  }

  run<T>(start: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.stopped || signal?.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
      const entry: PendingStart = {
        start: () => {
          signal?.removeEventListener("abort", entry.cancel);
          // Invoke synchronously at the granted start time, without awaiting the response.
          try { void start().then(resolve, reject); } catch (error) { reject(error); }
        },
        cancel: () => {
          signal?.removeEventListener("abort", entry.cancel);
          const index = this.pending.indexOf(entry);
          if (index >= 0) this.pending.splice(index, 1);
          reject(abortError());
          this.schedule();
        },
      };
      signal?.addEventListener("abort", entry.cancel, { once: true });
      this.pending.push(entry);
      this.schedule();
    });
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const entry of [...this.pending]) entry.cancel();
  }

  private schedule(): void {
    if (this.stopped) return;
    if (this.pending.length === 0) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      return;
    }
    if (this.timer) return;
    const delay = this.nextStartAt - performance.now();
    if (delay > 0) {
      this.timer = setTimeout(() => { this.timer = undefined; this.schedule(); }, Math.ceil(delay));
      return;
    }
    const entry = this.pending.shift()!;
    // Never catch up missed slots after an event-loop stall.
    this.nextStartAt = performance.now() + this.intervalMs;
    entry.start();
    this.schedule();
  }
}

function abortError() { return new DOMException("Image request start cancelled", "AbortError"); }
