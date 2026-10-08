import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveExecutionTimeout } from "../src/sessions/active-execution-timeout.js";

afterEach(() => vi.useRealTimers());
describe("Agent active execution budget", () => {
  it("excludes overlapping image waits and resumes the remaining budget only once", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const budget = new ActiveExecutionTimeout(1000);
    vi.advanceTimersByTime(300);
    const first = budget.pause();
    const second = budget.pause();
    vi.advanceTimersByTime(10_000);
    first(); first();
    vi.advanceTimersByTime(10_000);
    expect(budget.signal.aborted).toBe(false);
    second();
    vi.advanceTimersByTime(699);
    expect(budget.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(budget.signal.aborted).toBe(true);
    budget.dispose();
  });

  it("does not rearm a disposed budget when an image waiter finishes late", () => {
    vi.useFakeTimers();
    const budget = new ActiveExecutionTimeout(1000);
    const resume = budget.pause();
    budget.dispose();
    resume();
    vi.advanceTimersByTime(20_000);
    expect(budget.signal.aborted).toBe(false);
  });
});
