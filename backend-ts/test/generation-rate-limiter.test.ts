import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationRateLimiterService } from "../src/generation/generation-rate-limiter.service.js";

describe("image model request rate limiter", () => {
  let limiter: GenerationRateLimiterService;
  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new GenerationRateLimiterService({ get: () => 2 } as never);
  });
  afterEach(() => { limiter.onModuleDestroy(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it("cools down on startup and spaces actual starts across one-second windows", async () => {
    const starts: number[] = [];
    const results = Array.from({ length: 8 }, () => limiter.run(async () => { starts.push(performance.now()); }));
    await vi.advanceTimersByTimeAsync(999);
    expect(starts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(starts).toEqual([1000]);
    await vi.advanceTimersByTimeAsync(3500);
    await Promise.all(results);
    expect(starts).toEqual([1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500]);
    for (let window = 0; window < 5000; window += 100) {
      expect(starts.filter((time) => time >= window && time < window + 1000).length).toBeLessThanOrEqual(2);
    }
  });

  it("starts more than thirty requests while all previous responses remain pending", async () => {
    const finish: Array<() => void> = [];
    const results = Array.from({ length: 40 }, () => limiter.run(() => new Promise<void>((resolve) => finish.push(resolve))));
    await vi.advanceTimersByTimeAsync(20_500);
    expect(finish).toHaveLength(40);
    finish.forEach((resolve) => resolve());
    await Promise.all(results);
  });

  it("removes cancelled waiters immediately without using a request-start slot", async () => {
    const controller = new AbortController();
    const first = vi.fn(async () => "first");
    const cancelled = vi.fn(async () => "cancelled");
    const last = vi.fn(async () => "last");
    const one = limiter.run(first);
    const two = limiter.run(cancelled, controller.signal);
    const rejected = expect(two).rejects.toMatchObject({ name: "AbortError" });
    const three = limiter.run(last);
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(1500);
    expect(await one).toBe("first");
    expect(await three).toBe("last");
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("does not accumulate permits during idle time", async () => {
    await vi.advanceTimersByTimeAsync(10_000);
    const starts: number[] = [];
    const calls = Array.from({ length: 3 }, () => limiter.run(async () => { starts.push(performance.now()); }));
    expect(starts).toEqual([10_000]);
    await vi.advanceTimersByTimeAsync(999);
    expect(starts).toEqual([10_000, 10_500]);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all(calls);
    expect(starts).toEqual([10_000, 10_500, 11_000]);
  });

  it("does not burst after a delayed timer callback", async () => {
    const clock = performance.now.bind(performance);
    let delay = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock() + delay);
    const starts: number[] = [];
    const calls = Array.from({ length: 3 }, () => limiter.run(async () => { starts.push(performance.now()); }));
    // Simulate the event loop having stalled five seconds before handling its first timer.
    delay = 5000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(starts).toEqual([6000]);
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.all(calls);
    expect(starts).toEqual([6000, 6500, 7000]);
  });

  it("propagates provider failures without stopping later request starts", async () => {
    const one = limiter.run(() => { throw new Error("provider rejected"); });
    const failed = expect(one).rejects.toThrow("provider rejected");
    const two = limiter.run(async () => "ok");
    await vi.advanceTimersByTimeAsync(1500);
    await failed;
    expect(await two).toBe("ok");
  });

  it("rejects pending work on shutdown without starting a model call", async () => {
    const start = vi.fn(async () => undefined);
    const waiting = limiter.run(start);
    const rejected = expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    limiter.onModuleDestroy();
    await rejected;
    await vi.advanceTimersByTimeAsync(5000);
    expect(start).not.toHaveBeenCalled();
    await expect(limiter.run(start)).rejects.toMatchObject({ name: "AbortError" });
  });
});
