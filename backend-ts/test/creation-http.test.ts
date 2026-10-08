import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreationHttpService } from "../src/sessions/creation-http.service.js";
import { ExecutionConflict } from "../src/sessions/execution-repository.js";

let service: CreationHttpService | undefined;
afterEach(async () => { await service?.onModuleDestroy(); service = undefined; });

async function start() {
  const runtime = { deleteSession: vi.fn().mockResolvedValue({ sessionId: "6", deleted: true }) };
  const values: Record<string, unknown> = {
    AIVISTA_RUNTIME_HOST: "127.0.0.1", AIVISTA_RUNTIME_PORT: 0, AIVISTA_GENERATION_WORKER_TOKEN: "test-token",
  };
  service = new CreationHttpService({ get: (key: string) => values[key] } as never, runtime as never);
  await service.onModuleInit();
  const address = (service as unknown as { server: Server }).server.address();
  if (!address || typeof address === "string") throw new Error("Missing test listener");
  return { runtime, url: `http://127.0.0.1:${address.port}/internal/generation-sessions/6` };
}

const headers = { "X-AiVista-Worker-Token": "test-token", "X-AiVista-User-Id": "4" };
describe("Internal session deletion", () => {
  it("routes DELETE with the trusted user identity and no request body", async () => {
    const { runtime, url } = await start();
    const response = await fetch(url, { method: "DELETE", headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sessionId: "6", deleted: true });
    expect(runtime.deleteSession).toHaveBeenCalledWith("4", "6");
  });

  it.each([ ["NOT_FOUND", 404], ["SESSION_BUSY", 409] ] as const)("returns %s as HTTP %s", async (code, status) => {
    const { runtime, url } = await start();
    runtime.deleteSession.mockRejectedValueOnce(new ExecutionConflict(code));
    const response = await fetch(url, { method: "DELETE", headers });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
  });

  it("rejects an untrusted caller before touching the session", async () => {
    const { runtime, url } = await start();
    const response = await fetch(url, { method: "DELETE", headers: { ...headers, "X-AiVista-Worker-Token": "wrong" } });
    expect(response.status).toBe(401);
    expect(runtime.deleteSession).not.toHaveBeenCalled();
  });
});
