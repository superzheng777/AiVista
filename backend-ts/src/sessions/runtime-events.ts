import type { RuntimeEventClient, RuntimeEvent } from "./runtime-event-client.js";

/** Coalesce text updates; a single delivery chain preserves order without blocking the model loop. */
export class RuntimeEvents {
  private readonly pending = new Map<string, RuntimeEvent>();
  private readonly timer: ReturnType<typeof setInterval>;
  private delivery: Promise<void> = Promise.resolve();
  constructor(private readonly client: RuntimeEventClient) {
    this.timer = setInterval(() => this.flush(), 100);
    this.timer.unref();
  }

  push(event: RuntimeEvent): void {
    this.pending.set(`${event.creationId}:${event.item?.id ?? "status"}`, event);
  }

  flush(): void {
    if (!this.pending.size) return;
    const batch = [...this.pending.values()];
    this.pending.clear();
    // Reconnection obtains a fresh snapshot. Replaying stale text after a failed delivery is unnecessary.
    this.delivery = this.delivery.then(() => this.client.publish(batch)).catch(() => undefined);
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    this.flush();
    await this.delivery;
  }
}
