import { EventEmitter } from "node:events";
import type { ConsumeMessage } from "amqplib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationQueueService } from "../src/sessions/generation-queue.service.js";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("amqplib", () => ({ connect }));
vi.mock("../src/sessions/generation-task.service.js", () => ({ GenerationTaskService: class {} }));

describe("image generation queue", () => {
  let consume: (message: ConsumeMessage | null) => void;
  let service: GenerationQueueService;
  let connection: ReturnType<typeof createConnection>;
  const tasks = { recover: vi.fn(), queued: vi.fn(), markDispatched: vi.fn(), execute: vi.fn() };
  const config = {
    AIVISTA_GENERATION_QUEUE_ENABLED: true, AIVISTA_GENERATION_PREFETCH: 200,
    AIVISTA_RABBITMQ_CONFIRM_TIMEOUT_MS: 10_000,
  };
  const channel = Object.assign(new EventEmitter(), {
    assertQueue: vi.fn(), prefetch: vi.fn(), ack: vi.fn(), nack: vi.fn(),
    consume: vi.fn((_queue, callback) => { consume = callback; }), sendToQueue: vi.fn(),
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    channel.removeAllListeners();
    tasks.recover.mockResolvedValue(undefined);
    tasks.queued.mockResolvedValue([]);
    tasks.markDispatched.mockResolvedValue(undefined);
    tasks.execute.mockResolvedValue(undefined);
    connection = createConnection();
    connect.mockResolvedValue(connection);
    service = new GenerationQueueService({ get: (key: keyof typeof config) => config[key] } as never, tasks as never);
  });
  afterEach(async () => { await service.onModuleDestroy(); vi.useRealTimers(); });

  function createConnection() {
    return Object.assign(new EventEmitter(), {
      close: vi.fn(async () => undefined), createConfirmChannel: vi.fn(async () => channel),
    });
  }

  it("recovers before registering one manual-ack consumer with prefetch 200", async () => {
    const recovery = deferred<void>();
    tasks.recover.mockReturnValue(recovery.promise);
    const startup = service.onModuleInit();
    expect(connect).not.toHaveBeenCalled();
    recovery.resolve();
    await startup;
    expect(channel.assertQueue).toHaveBeenCalledWith("aivista.generation.execute.v1",
      { durable: true, arguments: { "x-queue-type": "quorum" } });
    expect(channel.prefetch).toHaveBeenCalledWith(200);
    expect(channel.consume).toHaveBeenCalledExactlyOnceWith("aivista.generation.execute.v1", expect.any(Function), { noAck: false });
  });

  it("keeps each message unacknowledged until its own execution has persisted the result", async () => {
    await service.onModuleInit();
    const pending = deferred<void>();
    tasks.execute.mockReturnValueOnce(pending.promise);
    const first = message("11");
    const second = message("12");
    consume(first);
    consume(second);
    await Promise.resolve();
    expect(tasks.execute).toHaveBeenNthCalledWith(1, "11", 0);
    expect(tasks.execute).toHaveBeenNthCalledWith(2, "12", 0);
    expect(channel.ack).toHaveBeenCalledExactlyOnceWith(second);
    pending.resolve();
    await Promise.resolve();
    expect(channel.ack).toHaveBeenCalledWith(first);
  });

  it("requeues transient persistence errors instead of acknowledging an unfinished task", async () => {
    await service.onModuleInit();
    tasks.execute.mockRejectedValueOnce(new Error("database unavailable"));
    const task = message("13");
    consume(task);
    await vi.advanceTimersByTimeAsync(999);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(channel.nack).toHaveBeenCalledWith(task, false, true);
  });

  it("marks dispatch only after RabbitMQ confirms the persistent image command", async () => {
    tasks.queued.mockResolvedValueOnce([{ id: "14", revision: 3 }]);
    let confirm: (error: Error | null) => void = () => undefined;
    channel.sendToQueue.mockImplementationOnce((_queue, _body, _options, callback) => { confirm = callback; });
    const startup = service.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.sendToQueue).toHaveBeenCalledWith("aivista.generation.execute.v1",
      Buffer.from(JSON.stringify({ generationId: "14", expectedRevision: 3 })),
      { persistent: true, contentType: "application/json" }, expect.any(Function));
    expect(tasks.markDispatched).not.toHaveBeenCalled();
    confirm(null);
    await startup;
    expect(tasks.markDispatched).toHaveBeenCalledWith("14", 3);
  });

  it("leaves unconfirmed messages eligible for dispatch retry", async () => {
    tasks.queued.mockResolvedValueOnce([{ id: "15", revision: 0 }]);
    channel.sendToQueue.mockImplementationOnce((_queue, _body, _options, callback) => callback(new Error("publish rejected")));
    await service.onModuleInit();
    expect(tasks.markDispatched).not.toHaveBeenCalled();
  });

  it("times out a missing publisher confirmation without marking the task dispatched", async () => {
    tasks.queued.mockResolvedValueOnce([{ id: "16", revision: 0 }]);
    channel.sendToQueue.mockImplementationOnce(() => true);
    const startup = service.onModuleInit();
    await vi.advanceTimersByTimeAsync(10_000);
    await startup;
    expect(tasks.markDispatched).not.toHaveBeenCalled();
  });

  it("reconnects without recovering running images a second time", async () => {
    await service.onModuleInit();
    connection.emit("close");
    await vi.advanceTimersByTimeAsync(2000);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(tasks.recover).toHaveBeenCalledTimes(1);
  });

  it("registers another consumer after broker-side cancellation", async () => {
    await service.onModuleInit();
    consume(null);
    expect(connection.close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(channel.consume).toHaveBeenCalledTimes(2);
    expect(tasks.recover).toHaveBeenCalledTimes(1);
  });

  it("does not connect or recover when the image queue is disabled", async () => {
    const disabled = new GenerationQueueService({ get: () => false } as never, tasks as never);
    await disabled.onModuleInit();
    expect(connect).not.toHaveBeenCalled();
    expect(tasks.recover).not.toHaveBeenCalled();
    await disabled.onModuleDestroy();
  });

  it("discards invalid commands without invoking the model task service", async () => {
    await service.onModuleInit();
    const invalid = { content: Buffer.from('{"executionId":"1","expectedRevision":0}') } as ConsumeMessage;
    consume(invalid);
    expect(channel.ack).toHaveBeenCalledWith(invalid);
    expect(tasks.execute).not.toHaveBeenCalled();
  });

  it("does not acknowledge a result using an already closed channel", async () => {
    await service.onModuleInit();
    const execution = deferred<void>();
    tasks.execute.mockReturnValueOnce(execution.promise);
    consume(message("17"));
    connection.emit("close");
    execution.resolve();
    await Promise.resolve();
    expect(channel.ack).not.toHaveBeenCalled();
  });
});

function message(generationId: string): ConsumeMessage {
  return { content: Buffer.from(JSON.stringify({ generationId, expectedRevision: 0 })) } as ConsumeMessage;
}
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
