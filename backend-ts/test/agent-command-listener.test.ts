import { describe, expect, it, vi } from "vitest";
import { AgentCommandListenerService } from "../src/agent/agent-command-listener.service.js";

describe("AgentCommandListenerService", () => {
  it("acks only after the reliable execution boundary succeeds", async () => {
    const execution = { execute: vi.fn().mockResolvedValue(undefined) };
    const channel = { ack: vi.fn(), nack: vi.fn() };
    const message = { content: Buffer.from('{"creationId":151,"expectedRevision":0}') };

    await new AgentCommandListenerService(execution as never).consume(message as never, channel as never);

    expect(execution.execute).toHaveBeenCalledWith({ creationId: 151n, expectedRevision: 0 }, undefined);
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it("acks an invalid command without entering the execution boundary", async () => {
    const execution = { execute: vi.fn() };
    const channel = { ack: vi.fn(), nack: vi.fn() };
    const message = { content: Buffer.from('{"creationId":"invalid","expectedRevision":0}') };

    await new AgentCommandListenerService(execution as never).consume(message as never, channel as never);

    expect(execution.execute).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it("requeues the command when the execution boundary fails", async () => {
    const execution = { execute: vi.fn().mockRejectedValue(new Error("Java unavailable")) };
    const channel = { ack: vi.fn(), nack: vi.fn() };
    const message = { content: Buffer.from('{"creationId":151,"expectedRevision":0}') };

    await new AgentCommandListenerService(execution as never).consume(message as never, channel as never);

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });
});
