import { afterEach, expect, it } from "vitest";
import { selectSessionIndicators, useGenerationEventStreamStore } from "./generation-event-stream-store";

afterEach(() => useGenerationEventStreamStore.setState(useGenerationEventStreamStore.getInitialState(), true));

it("acknowledges completed results without dropping failures in the same or other sessions", () => {
  useGenerationEventStreamStore.setState({
    completedSessionIds: new Set(["first", "second"]),
    attentionSessionIds: new Set(["second", "third"]),
  });
  expect(selectSessionIndicators(useGenerationEventStreamStore.getState())).toEqual({
    first: "COMPLETED",
    second: "ATTENTION",
    third: "ATTENTION",
  });
  useGenerationEventStreamStore.getState().acknowledgeCompletedResults();
  expect(selectSessionIndicators(useGenerationEventStreamStore.getState())).toEqual({
    second: "ATTENTION",
    third: "ATTENTION",
  });
  useGenerationEventStreamStore.getState().acknowledgeSession("second");
  expect(selectSessionIndicators(useGenerationEventStreamStore.getState())).toEqual({ third: "ATTENTION" });
});
