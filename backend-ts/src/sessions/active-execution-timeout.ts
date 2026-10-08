/** Agent execution budget excludes time spent awaiting durable image tasks. */
export class ActiveExecutionTimeout {
  private readonly controller = new AbortController();
  private remaining: number;
  private started = performance.now();
  private pauses = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(milliseconds: number) {
    this.remaining = milliseconds;
    this.schedule();
  }

  get signal(): AbortSignal { return this.controller.signal; }

  pause(): () => void {
    if (this.pauses++ === 0) {
      this.remaining = Math.max(0, this.remaining - (performance.now() - this.started));
      clearTimeout(this.timer);
    }
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      if (--this.pauses === 0 && !this.disposed) this.schedule();
    };
  }

  dispose(): void { this.disposed = true; clearTimeout(this.timer); }

  private schedule(): void {
    this.started = performance.now();
    this.timer = setTimeout(() => this.controller.abort(new Error("AGENT_TIMEOUT")), this.remaining);
    this.timer.unref();
  }
}
