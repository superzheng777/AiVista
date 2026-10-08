import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { CreationRuntimeService } from "./creation-runtime.service.js";

/** Single runtime process: durable SQL acceptance with immediate and periodic local dispatch. */
@Injectable()
export class CreationDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CreationDispatcherService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private scanning = false;
  private stopped = false;

  constructor(private readonly runtime: CreationRuntimeService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.runtime.executions.recoverInterrupted();
    this.runtime.onQueued = () => { void this.tick(); };
    this.timer = setInterval(() => { void this.tick(); }, 1000);
    this.timer.unref();
    await this.tick();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    clearInterval(this.timer);
    this.runtime.onQueued = undefined;
  }

  private async tick(): Promise<void> {
    if (this.scanning || this.stopped) return;
    this.scanning = true;
    try {
      for (const row of await this.runtime.executions.queued()) {
        if (this.stopped) break;
        // Waiting on one loop here would impose an artificial global concurrency limit.
        void this.runtime.execute(String(row.id), row.revision).catch((error: unknown) => {
          this.logger.error(`Creation ${row.id} dispatch failed: ${String(error)}`);
        });
      }
    } catch (error) {
      this.logger.warn(`Creation scan failed: ${String(error)}`);
    } finally { this.scanning = false; }
  }
}
