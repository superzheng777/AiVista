import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JavaAgentCompletionClient } from "../src/agent/adapters/java-agent-completion-client.js";
import type { Environment } from "../src/config/environment.js";

afterEach(() => vi.unstubAllGlobals());

describe("JavaAgentCompletionClient", () => {
  it("submits an idempotent Agent completion without a response body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new JavaAgentCompletionClient(new ConfigService<Environment, true>({
      AIVISTA_JAVA_BASE_URL: "http://java/api", AIVISTA_GENERATION_WORKER_TOKEN: "worker-secret",
      AIVISTA_JAVA_REQUEST_TIMEOUT_MS: 10_000,
    } as Environment));
    const command = { contractVersion: 2 as const, creationId: "151",
      expectedRevision: 0, outcome: "SUCCEEDED" as const, failureCode: null, finalMessage: "海报已生成。",
      activities: [], agentContext: { schemaVersion: 1 as const, compaction: null, messages: [] } };

    await expect(client.complete(command)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/agent-creations/151/completion"),
      expect.objectContaining({ method: "PUT" }));
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual(command);
  });

  it("retries transient server failures before acknowledging completion", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new JavaAgentCompletionClient(new ConfigService<Environment, true>({
      AIVISTA_JAVA_BASE_URL: "http://java/api", AIVISTA_GENERATION_WORKER_TOKEN: "worker-secret",
      AIVISTA_JAVA_REQUEST_TIMEOUT_MS: 10_000,
    } as Environment));

    await expect(client.complete({ contractVersion: 2, creationId: "151", expectedRevision: 0,
      outcome: "SUCCEEDED", failureCode: null, finalMessage: "海报已生成。", activities: [],
      agentContext: { schemaVersion: 1, compaction: null, messages: [] } }))
      .resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a rejected completion contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new JavaAgentCompletionClient(new ConfigService<Environment, true>({
      AIVISTA_JAVA_BASE_URL: "http://java/api", AIVISTA_GENERATION_WORKER_TOKEN: "worker-secret",
      AIVISTA_JAVA_REQUEST_TIMEOUT_MS: 10_000,
    } as Environment));

    await expect(client.complete({ contractVersion: 2, creationId: "151", expectedRevision: 0,
      outcome: "SUCCEEDED", failureCode: null, finalMessage: "海报已生成。", activities: [],
      agentContext: { schemaVersion: 1, compaction: null, messages: [] } }))
      .rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
