import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JavaAgentFormClient } from "../src/agent/adapters/java-agent-form-client.js";
import type { Environment } from "../src/config/environment.js";

afterEach(() => vi.unstubAllGlobals());

describe("JavaAgentFormClient", () => {
  it("persists one Agent form with the stable Tool call identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse(201));
    vi.stubGlobal("fetch", fetchMock);
    const client = new JavaAgentFormClient(config());

    await client.request("151", "call-1", command());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://java/api/internal/generation-worker/agent-creations/151/forms/call-1",
      expect.objectContaining({ method: "PUT", headers: expect.objectContaining({
        "X-AiVista-Worker-Token": "worker-secret",
      }) }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual(command());
  });

  it("retries a transient response with the same Tool call identity", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(successResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new JavaAgentFormClient(config()).request("151", "call-1", command()))
      .resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "http://java/api/internal/generation-worker/agent-creations/151/forms/call-1",
      "http://java/api/internal/generation-worker/agent-creations/151/forms/call-1",
    ]);
  });

  it("does not retry a rejected form contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new JavaAgentFormClient(config()).request("151", "call-1", command()))
      .rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function command() {
  return { contractVersion: 1 as const, expectedRevision: 0, activities: [], form: {
    schemaVersion: 1 as const, title: "确认海报方向", fields: [{
      id: "theme", label: "主题", type: "TEXT" as const, required: true,
      initialValue: "关爱动物",
    }],
  } };
}

function successResponse(status: 201 | 204): Response { return new Response(null, { status }); }

function config(): ConfigService<Environment, true> {
  return new ConfigService<Environment, true>({
    AIVISTA_JAVA_BASE_URL: "http://java/api",
    AIVISTA_GENERATION_WORKER_TOKEN: "worker-secret",
    AIVISTA_JAVA_REQUEST_TIMEOUT_MS: 10_000,
  } as Environment);
}
