import { afterEach, expect, it } from "vitest";
import { selectSessionIndicators, useUserEventStreamStore } from "./user-event-stream-store";

afterEach(() => useUserEventStreamStore.setState(useUserEventStreamStore.getInitialState(), true));

it("acknowledges completed results without dropping failures in the same or other sessions", () => {
  useUserEventStreamStore.setState({
    completedSessionIds: new Set(["first", "second"]),
    attentionSessionIds: new Set(["second", "third"]),
  });
  expect(selectSessionIndicators(useUserEventStreamStore.getState())).toEqual({
    first: "COMPLETED",
    second: "ATTENTION",
    third: "ATTENTION",
  });
  useUserEventStreamStore.getState().acknowledgeCompletedResults();
  expect(selectSessionIndicators(useUserEventStreamStore.getState())).toEqual({
    second: "ATTENTION",
    third: "ATTENTION",
  });
  useUserEventStreamStore.getState().acknowledgeSession("second");
  expect(selectSessionIndicators(useUserEventStreamStore.getState())).toEqual({ third: "ATTENTION" });
});
