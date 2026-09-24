import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const processorShutdown = vi.fn(async () => undefined);
  const processorConstructor = vi.fn(function MockLangfuseSpanProcessor(
    this: { shutdown: typeof processorShutdown },
    _options: unknown,
  ) {
    this.shutdown = processorShutdown;
  });
  const providerRegister = vi.fn();
  const providerShutdown = vi.fn(async () => undefined);
  const providerConstructor = vi.fn(function MockNodeTracerProvider(
    this: { register: typeof providerRegister; shutdown: typeof providerShutdown },
    _options: unknown,
  ) {
    this.register = providerRegister;
    this.shutdown = providerShutdown;
  });
  const root = { startObservation: vi.fn() };
  const propagateAttributes = vi.fn((_attributes: unknown, callback: () => unknown) => callback());
  const startActiveObservation = vi.fn((
    _name: string,
    callback: (observation: typeof root) => unknown,
    _options: unknown,
  ) => callback(root));
  const recorderConstructor = vi.fn();
  const recorderFinishRun = vi.fn();
  const recorderFailRun = vi.fn();
  const recorderAbortRun = vi.fn();
  const recorderCloseOpenObservations = vi.fn();

  return {
    processorShutdown,
    processorConstructor,
    providerRegister,
    providerShutdown,
    providerConstructor,
    root,
    propagateAttributes,
    startActiveObservation,
    recorderConstructor,
    recorderFinishRun,
    recorderFailRun,
    recorderAbortRun,
    recorderCloseOpenObservations,
  };
});

vi.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor: mocks.processorConstructor,
}));

vi.mock("@opentelemetry/sdk-trace-node", () => ({
  NodeTracerProvider: mocks.providerConstructor,
}));

vi.mock("@langfuse/tracing", () => ({
  propagateAttributes: mocks.propagateAttributes,
  startActiveObservation: mocks.startActiveObservation,
}));

vi.mock("../src/observability/agent-trace-recorder.js", () => ({
  AgentTraceRecorder: class MockAgentTraceRecorder {
    constructor(root: unknown, prompt: string, onError: (error: unknown) => void) {
      mocks.recorderConstructor(root, prompt, onError);
    }

    finishRun(result: unknown): void {
      mocks.recorderFinishRun(result);
    }

    failRun(error: unknown): void {
      mocks.recorderFailRun(error);
    }

    abortRun(): void {
      mocks.recorderAbortRun();
    }

    closeOpenObservations(): void {
      mocks.recorderCloseOpenObservations();
    }
  },
}));

import { AgentObservabilityService, type AgentRunTraceContext } from
  "../src/observability/agent-observability.service.js";

describe("AgentObservabilityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs once without initializing tracing when Langfuse is disabled", async () => {
    const service = new AgentObservabilityService(config({ AIVISTA_LANGFUSE_ENABLED: false }));
    const execute = vi.fn(async () => completedResult());

    await expect(service.traceAgentRun(traceContext(), execute)).resolves.toEqual(completedResult());

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(undefined);
    expect(mocks.processorConstructor).not.toHaveBeenCalled();
    expect(mocks.providerConstructor).not.toHaveBeenCalled();
    expect(mocks.propagateAttributes).not.toHaveBeenCalled();
    expect(mocks.startActiveObservation).not.toHaveBeenCalled();
  });

  it("initializes the lightweight exporter and propagates the Agent trace identity", async () => {
    const service = new AgentObservabilityService(enabledConfig());
    const result = completedResult();
    const execute = vi.fn(async (_recorder: unknown) => result);

    await expect(service.traceAgentRun(traceContext(), execute)).resolves.toBe(result);

    expect(mocks.processorConstructor).toHaveBeenCalledWith({
      publicKey: "pk-test",
      secretKey: "sk-test",
      baseUrl: "https://langfuse.example",
      exportMode: "batched",
      mediaUploadEnabled: false,
    });
    expect(mocks.providerConstructor).toHaveBeenCalledWith({
      spanProcessors: [mocks.processorConstructor.mock.instances[0]],
    });
    expect(mocks.providerRegister).toHaveBeenCalledOnce();
    expect(mocks.propagateAttributes).toHaveBeenCalledWith({
      traceName: "AGENT_RUN",
      sessionId: "session-101",
      tags: ["aivista-agent", "resumed"],
      metadata: {
        creationId: "151",
        revision: "2",
        resumed: "true",
      },
    }, expect.any(Function));
    expect(mocks.startActiveObservation).toHaveBeenCalledWith(
      "AGENT_RUN", expect.any(Function), { asType: "agent" },
    );
    expect(mocks.recorderConstructor).toHaveBeenCalledWith(
      mocks.root, "继续生成", expect.any(Function),
    );
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toBeDefined();
    expect(mocks.recorderFinishRun).toHaveBeenCalledWith(result);
    expect(mocks.recorderFailRun).not.toHaveBeenCalled();
    expect(mocks.recorderCloseOpenObservations).toHaveBeenCalledOnce();
  });

  it("falls back to exactly one untraced execution when initialization fails", async () => {
    const initializationError = new Error("provider registration failed");
    mocks.providerRegister.mockImplementationOnce(() => { throw initializationError; });
    const service = new AgentObservabilityService(enabledConfig());
    const execute = vi.fn(async () => completedResult());

    await expect(service.traceAgentRun(traceContext(), execute)).resolves.toEqual(completedResult());

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(undefined);
    expect(mocks.processorShutdown).toHaveBeenCalledOnce();
    expect(mocks.propagateAttributes).not.toHaveBeenCalled();
    expect(mocks.startActiveObservation).not.toHaveBeenCalled();
  });

  it("falls back once when the trace cannot be created before execution starts", async () => {
    mocks.startActiveObservation.mockImplementationOnce(() => { throw new Error("trace creation failed"); });
    const service = new AgentObservabilityService(enabledConfig());
    const execute = vi.fn(async () => completedResult());

    await expect(service.traceAgentRun(traceContext(), execute)).resolves.toEqual(completedResult());

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(undefined);
  });

  it("rethrows the original business error without rerunning the Agent", async () => {
    const businessError = new Error("Agent failed");
    const service = new AgentObservabilityService(enabledConfig());
    const execute = vi.fn(async () => { throw businessError; });

    await expect(service.traceAgentRun(traceContext(), execute)).rejects.toBe(businessError);

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.recorderFailRun).toHaveBeenCalledWith(businessError);
    expect(mocks.recorderCloseOpenObservations).toHaveBeenCalledOnce();
  });

  it("records an aborted signal as a warning without turning it into a failure", async () => {
    const controller = new AbortController();
    controller.abort("USER_CANCELLED");
    const service = new AgentObservabilityService(enabledConfig());
    const cancellation = new Error("Pi stopped");
    const execute = vi.fn(async () => { throw cancellation; });

    await expect(service.traceAgentRun({ ...traceContext(), signal: controller.signal }, execute))
      .rejects.toBe(cancellation);

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.recorderAbortRun).toHaveBeenCalledOnce();
    expect(mocks.recorderFailRun).not.toHaveBeenCalled();
  });

  it("keeps a loop timeout classified as a failure", async () => {
    const controller = new AbortController();
    const timeout = new DOMException("The operation timed out", "TimeoutError");
    controller.abort(timeout);
    const service = new AgentObservabilityService(enabledConfig());
    const execute = vi.fn(async () => { throw timeout; });

    await expect(service.traceAgentRun({ ...traceContext(), signal: controller.signal }, execute))
      .rejects.toBe(timeout);

    expect(mocks.recorderFailRun).toHaveBeenCalledWith(timeout);
    expect(mocks.recorderAbortRun).not.toHaveBeenCalled();
  });

  it("returns a completed result when observation finalization fails afterward", async () => {
    const finalizationError = new Error("span finalization failed");
    mocks.startActiveObservation.mockImplementationOnce(async (_name, callback) => {
      await callback(mocks.root);
      throw finalizationError;
    });
    const service = new AgentObservabilityService(enabledConfig());
    const result = completedResult();
    const execute = vi.fn(async () => result);

    await expect(service.traceAgentRun(traceContext(), execute)).resolves.toBe(result);

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.recorderFinishRun).toHaveBeenCalledWith(result);
    expect(mocks.recorderCloseOpenObservations).toHaveBeenCalledOnce();
  });

  it("shuts down the registered provider once", async () => {
    const service = new AgentObservabilityService(enabledConfig());
    await service.traceAgentRun(traceContext(), async () => completedResult());

    await service.onApplicationShutdown();
    await service.onApplicationShutdown();

    expect(mocks.providerShutdown).toHaveBeenCalledOnce();
  });
});

function config(values: Record<string, unknown>) {
  return { get: vi.fn((key: string) => values[key]) } as never;
}

function enabledConfig() {
  return config({
    AIVISTA_LANGFUSE_ENABLED: true,
    LANGFUSE_PUBLIC_KEY: "pk-test",
    LANGFUSE_SECRET_KEY: "sk-test",
    LANGFUSE_BASE_URL: "https://langfuse.example/",
  });
}

function traceContext(): AgentRunTraceContext {
  return {
    sessionId: "session-101",
    creationId: "151",
    revision: 2,
    resumed: true,
    prompt: "继续生成",
  };
}

function completedResult() {
  return {
    outcome: "COMPLETED" as const,
    text: "完成",
    context: { schemaVersion: 1 as const, compaction: null, messages: [] },
  };
}
