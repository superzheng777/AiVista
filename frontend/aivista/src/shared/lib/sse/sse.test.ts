import { describe, expect, it } from "vitest";
import { parseSseBlock } from "./sse";
describe("SSE framing", () => {
  it("preserves multiline data and ignores heartbeat comments", () => {
    expect(parseSseBlock(": heartbeat")).toBeNull();
    expect(parseSseBlock("event: example\ndata: first\ndata: second")).toEqual({
      eventName: "example",
      data: "first\nsecond",
    });
  });
});
