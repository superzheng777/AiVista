import { describe, expect, it } from "vitest";
import { parseAgentExecuteMessage } from "../src/agent/agent-execute-message.js";

describe("parseAgentExecuteMessage", () => {
  it("preserves Java BIGINT identifiers", () => {
    expect(parseAgentExecuteMessage(Buffer.from(
      '{"creationId":9007199254740995,"expectedRevision":0}')))
      .toEqual({ creationId: 9007199254740995n, expectedRevision: 0 });
  });

  it("rejects a non-positive Creation ID before the command can be requeued", () => {
    expect(() => parseAgentExecuteMessage(Buffer.from(
      '{"creationId":0,"expectedRevision":0}'))).toThrow();
  });
});
