import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "mysql2/promise";
import { createPool, type ResultSetHeader } from "mysql2";
import { Kysely, MysqlDialect, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { loadJavaLocalEnvironment } from "../src/config/java-local-environment.js";
import type { DatabaseSchema } from "../src/database/database.types.js";
import { ExecutionRepository, type CreateCreation } from "../src/sessions/execution-repository.js";
import { SessionStore } from "../src/sessions/session-store.js";
import { GenerationSettlement } from "../src/sessions/generation-settlement.js";
import { GenerationOutcomeUnknownError, GenerationTaskService } from "../src/sessions/generation-task.service.js";
import type { Environment } from "../src/config/environment.js";
import type { DatabaseService } from "../src/database/database.service.js";
import type { GenerationBailianClientService, BailianProviderResult } from "../src/generation/generation-bailian-client.service.js";
import type { GenerationImageTransferService } from "../src/generation/generation-image-transfer.service.js";
import type { GenerationImageUrlService } from "../src/generation/generation-image-url.service.js";
import type { GenerationRateLimiterService } from "../src/generation/generation-rate-limiter.service.js";
import type { RuntimeEvent, RuntimeEventClient } from "../src/sessions/runtime-event-client.js";
import type { GenerationToolRequest } from "../src/agent/tools/generation.js";
import type { GenerationExecution } from "../src/database/database.types.js";
import { creationStartSchema } from "../src/sessions/session-contract.js";
import { BailianProviderError, BailianTransportError } from "../src/generation/generation-provider-error.js";

const enabled = process.env.AIVISTA_NATIVE_SCHEMA_TEST === "true";
describe.skipIf(!enabled)("Unified execution SQL integration", () => {
  let db: Kysely<DatabaseSchema>;
  let repository: ExecutionRepository;
  let root: string;
  let userId: string;
  let legacyGenerationId: string;
  const database = `aivista_native_test_${process.pid}`;
  const config = loadJavaLocalEnvironment("../backend/aivista/src/main/resources/application-local.yaml", process.env);
  const connection = { host: String(config.AIVISTA_DB_HOST), port: Number(config.AIVISTA_DB_PORT),
    user: String(config.AIVISTA_DB_USERNAME), password: String(config.AIVISTA_DB_PASSWORD), timezone: "Z" };

  beforeAll(async () => {
    const admin = await createConnection({ ...connection, multipleStatements: true });
    // No IF NOT EXISTS: never reuse or erase an unrelated database.
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`USE \`${database}\``);
    const migrations = "../backend/aivista/src/main/resources/db/migration";
    for (const name of readdirSync(migrations).filter((name) => /^V\d+__.*\.sql$/.test(name)).sort()) {
      if (name.startsWith("V2__")) {
        const [legacyUser] = await admin.execute<ResultSetHeader>(
          "INSERT INTO users (login_name, nickname, password_hash) VALUES ('legacy_test', 'Legacy test', 'not-a-login-hash')");
        const [legacySession] = await admin.execute<ResultSetHeader>(
          "INSERT INTO generation_sessions (user_id, title, creation_count, last_message_at) VALUES (?, 'legacy', 1, UTC_TIMESTAMP(3))",
          [legacyUser.insertId]);
        const [legacyCreation] = await admin.execute<ResultSetHeader>(
          "INSERT INTO executions (user_id, session_id, kind, mode, status, request_json) VALUES (?, ?, 'CREATION', 'NORMAL', 'RUNNING', '{}')",
          [legacyUser.insertId, legacySession.insertId]);
        const [legacyImage] = await admin.execute<ResultSetHeader>(
          "INSERT INTO executions (user_id, session_id, parent_id, kind, mode, tool_call_id, status, request_json, requested_image_count, width, height) VALUES (?, ?, ?, 'GENERATION', 'NORMAL', 'legacy-image', 'RUNNING', '{}', 1, 2048, 2048)",
          [legacyUser.insertId, legacySession.insertId, legacyCreation.insertId]);
        legacyGenerationId = String(legacyImage.insertId);
      }
      await admin.query(readFileSync(join(migrations, name), "utf8"));
    }
    await admin.end();
    db = new Kysely<DatabaseSchema>({ dialect: new MysqlDialect({ pool: createPool({ ...connection,
      database, supportBigNumbers: true, bigNumberStrings: true }) }) });
    const user = await sql`INSERT INTO users (login_name, nickname, password_hash)
      VALUES ('native_test', 'Native test', 'not-a-login-hash')`.execute(db);
    userId = user.insertId!.toString();
    root = mkdtempSync(join(tmpdir(), "aivista-native-test-"));
    repository = new ExecutionRepository(db, new SessionStore(root, process.cwd()));
  });

  afterAll(async () => {
    if (db) {
      await db.destroy();
      const admin = await createConnection(connection);
      await admin.query(`DROP DATABASE \`${database}\``);
      await admin.end();
    }
    if (root) rmSync(root, { recursive: true });
  });

  const request: CreateCreation = { mode: "AGENT", input: { prompt: "测试创作", assetIds: [] }, settings: {} };
  it("upgrades legacy running images conservatively without issuing their paid request again", async () => {
    const row = (await sql<{ provider_started_at: Date | null }>`SELECT provider_started_at FROM executions
      WHERE id = ${legacyGenerationId}`.execute(db)).rows[0];
    expect(row?.provider_started_at).toBeInstanceOf(Date);
    const { service, provider } = taskService();
    await service.recover();
    await expect(service.waitForResult(legacyGenerationId)).rejects.toBeInstanceOf(GenerationOutcomeUnknownError);
    await service.execute(legacyGenerationId, 0);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("lets only one duplicate consumer claim a revision and rejects stale resume messages", async () => {
    const created = await repository.create(userId, request, []);
    const claims = await Promise.all([repository.claim(created.id, 0), repository.claim(created.id, 0)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const running = claims.find(Boolean)!;
    expect(await repository.transition(running, "WAITING_INPUT", { pendingToolCallId: "form-1" })).toBe(true);
    expect(await repository.transition(running, "FAILED")).toBe(false);
    const waiting = await repository.get(created.id);
    expect(await repository.transition(waiting, "QUEUED")).toBe(true);
    expect(await repository.claim(created.id, 0)).toBeNull();
    expect((await repository.claim(created.id, 3))?.revision).toBe(4);
  });

  it("enforces the thirtieth creation atomically without calling any model", async () => {
    const first = await repository.create(userId, request, []);
    await repository.transition(first, "FAILED");
    await sql`UPDATE generation_sessions SET creation_count = 29 WHERE id = ${first.session_id}`.execute(db);
    const results = await Promise.allSettled([
      repository.create(userId, { ...request, sessionId: first.session_id }, []),
      repository.create(userId, { ...request, sessionId: first.session_id }, []),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await repository.ownedSession(userId, first.session_id)).creation_count).toBe(30);
    await expect(repository.create(userId, { ...request, sessionId: first.session_id }, []))
      .rejects.toMatchObject({ code: "SESSION_CREATION_LIMIT" });
  });

  it("denies cross-user access and serializes active submissions in the same session", async () => {
    const first = await repository.create(userId, request, []);
    await expect(repository.ownedSession("999", first.session_id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.create(userId, { ...request, sessionId: first.session_id }, []))
      .rejects.toMatchObject({ code: "SESSION_BUSY" });
    expect((await repository.list(userId)).length).toBeGreaterThanOrEqual(3);
  });

  async function generation(count: number, createdAt = new Date()) {
    const parent = await repository.create(userId, request, []);
    const inserted = await sql`INSERT INTO executions (user_id, session_id, parent_id, kind, mode,
      tool_call_id, status, request_json, requested_image_count, width, height, created_at)
      VALUES (${userId}, ${parent.session_id}, ${parent.id}, 'GENERATION', 'NORMAL', 'test', 'RUNNING',
        '{}', ${count}, 2048, 2048, ${createdAt})`.execute(db);
    return inserted.insertId!.toString();
  }

  it("atomically settles partial output and makes duplicate result delivery idempotent", async () => {
    const settlement = new GenerationSettlement(db, { daily: 12, concurrent: 4 }, key => `https://images.test/${key}`);
    const id = await generation(2);
    await settlement.reserve(id);
    await settlement.reserve(id);
    const image = { sourceIndex: 0, objectKey: `users/${userId}/tasks/${id}/0`, fileSize: 100n, width: 2048, height: 2048 };
    const outputs = await Promise.all([settlement.settle(id, [image]), settlement.settle(id, [image])]);
    expect(outputs[0]).toEqual(outputs[1]);
    expect(outputs[0]?.status).toBe("PARTIALLY_SUCCEEDED");
    expect(outputs[0]?.assets).toHaveLength(1);
    const row = (await sql<{ count: number }>`SELECT SUM(requested_image_count) AS count FROM user_generation_daily_usage
      WHERE user_id = ${userId}`.execute(db)).rows[0]!;
    expect(Number(row.count)).toBe(1);
    expect((await repository.get(id)).status).toBe("PARTIALLY_SUCCEEDED");
  });

  it("rolls back invalid results, then refunds a failed generation on its original business day", async () => {
    const settlement = new GenerationSettlement(db, { daily: 12, concurrent: 4 }, key => `https://images.test/${key}`);
    const id = await generation(1, new Date("2026-01-01T15:59:00Z"));
    await settlement.reserve(id);
    await expect(settlement.settle(id, [{ sourceIndex: 0, objectKey: "wrong-owner", fileSize: 100n, width: 2048, height: 2048 }]))
      .rejects.toThrow("Invalid transferred image");
    expect((await repository.get(id)).status).toBe("RUNNING");
    expect((await settlement.settle(id, [])).status).toBe("FAILED");
    await settlement.settle(id, []);
    const row = (await sql<{ count: number }>`SELECT requested_image_count AS count FROM user_generation_daily_usage
      WHERE user_id = ${userId} AND usage_date = '2026-01-01'`.execute(db)).rows[0]!;
    expect(Number(row.count)).toBe(0);
  });

  const imageRequest: GenerationToolRequest = { operation: "TEXT_TO_IMAGE", prompt: "海边的咖啡杯",
    negativePrompt: null, aspectRatio: "1:1", inputAssetIds: [], promptExtend: false, imageCount: 1 };
  const providerResult: BailianProviderResult = { requestId: "provider-1", imageUrls: ["https://provider.test/one.png"] };

  function taskService() {
    const values = { AIVISTA_GENERATION_QUEUE_TIMEOUT_MS: 60_000, AIVISTA_GENERATION_DAILY_IMAGE_QUOTA: 1000,
      AIVISTA_GENERATION_MAX_ACTIVE_PER_USER: 200, AIVISTA_GENERATION_MODEL: "bailian/test" };
    const provider = { generate: vi.fn(async (_task: GenerationExecution) => providerResult) };
    const transfer = { transfer: vi.fn(async (task: GenerationExecution) => [{ sourceIndex: 0,
      objectKey: `users/${task.user_id}/tasks/${task.id}/0`, fileSize: 100n, width: task.width, height: task.height }]) };
    const limiter = { run: vi.fn(async (call: () => Promise<BailianProviderResult>, signal?: AbortSignal) => {
      signal?.throwIfAborted(); return call();
    }) };
    const events = { publish: vi.fn(async (_events: RuntimeEvent[]) => undefined) };
    const service = new GenerationTaskService({ get: (key: keyof typeof values) => values[key] } as unknown as ConfigService<Environment, true>,
      { db } as DatabaseService, provider as unknown as GenerationBailianClientService,
      transfer as unknown as GenerationImageTransferService,
      { unsigned: (key: string) => `https://images.test/${key}` } as GenerationImageUrlService,
      limiter as unknown as GenerationRateLimiterService, events as unknown as RuntimeEventClient);
    return { service, provider, transfer, limiter, events };
  }

  async function imageTask(service: GenerationTaskService) {
    const created = await repository.create(userId, request, []);
    const parent = (await repository.claim(created.id, created.revision))!;
    const start = creationStartSchema.parse(typeof parent.request_json === "string" ? JSON.parse(parent.request_json) : parent.request_json);
    const item = await service.create(parent, start, "image-call", imageRequest, new Map());
    return { id: item.generationId!, parent, start, item };
  }

  it("deduplicates a tool request before image-count checks and rejects changed request payloads", async () => {
    const { service } = taskService();
    const { parent, start, item } = await imageTask(service);
    const same = await service.create(parent, { ...start, settings: { imageCount: 1 } }, "image-call", imageRequest, new Map());
    expect(same).toEqual(item);
    await expect(service.create(parent, start, "image-call", { ...imageRequest, prompt: "changed" }, new Map()))
      .rejects.toThrow("cannot change");
    await expect(service.create(parent, { ...start, settings: { imageCount: 1 } }, "second", imageRequest, new Map()))
      .rejects.toThrow("creation limit");
  });

  it("runs duplicate deliveries once, stores the response before transfer, and reads results without events", async () => {
    const { service, provider, transfer, events } = taskService();
    const { id, parent } = await imageTask(service);
    transfer.transfer.mockImplementationOnce(async (task) => {
      const saved = (await sql<{ provider_response_json: unknown }>`SELECT provider_response_json FROM executions WHERE id = ${id}`.execute(db)).rows[0];
      expect(saved?.provider_response_json).toBeTruthy();
      return [{ sourceIndex: 0, objectKey: `users/${task.user_id}/tasks/${task.id}/0`, fileSize: 100n, width: task.width, height: task.height }];
    });
    events.publish.mockRejectedValue(new Error("offline"));
    await Promise.all([service.execute(id, 0), service.execute(id, 0)]);
    await service.execute(id, 0);
    expect(provider.generate).toHaveBeenCalledTimes(1);
    const result = await service.waitForResult(id);
    expect(result.status).toBe("SUCCEEDED");
    expect(result.assets).toHaveLength(1);
    expect((await service.history(String(parent.session_id)))[0]?.item.assets).toEqual(result.assets);
  });

  it("cancels queued work without calling the model", async () => {
    const { service, provider } = taskService();
    const { id, parent } = await imageTask(service);
    await service.cancelPending(String(parent.id));
    await service.execute(id, 0);
    expect(provider.generate).not.toHaveBeenCalled();
    expect((await repository.get(id)).status).toBe("CANCELLED");
  });

  it("acknowledges an obsolete image message whose task no longer exists", async () => {
    const { service, provider } = taskService();
    await expect(service.execute("999999999", 0)).resolves.toBeUndefined();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("cancels a reserved request waiting for rate permission and refunds exactly once", async () => {
    const { service, provider, limiter } = taskService();
    const { id, parent } = await imageTask(service);
    const ready = deferred<void>();
    limiter.run.mockImplementationOnce((_call, signal) => new Promise((_resolve, reject) => {
      signal!.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
      ready.resolve();
    }));
    const running = service.execute(id, 0);
    await ready.promise;
    await service.cancelPending(String(parent.id));
    await running;
    await service.cancelPending(String(parent.id));
    const row = (await sql<{ status: string; quota_refunded_at: unknown; quota_reserved_at: unknown }>`SELECT * FROM executions WHERE id = ${id}`.execute(db)).rows[0]!;
    expect(row.status).toBe("CANCELLED");
    expect(row.quota_reserved_at).toBeTruthy();
    expect(row.quota_refunded_at).toBeTruthy();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("finishes already-started requests after cancellation and publishes the settled image", async () => {
    const { service, provider, events } = taskService();
    const { id, parent } = await imageTask(service);
    const ready = deferred<void>();
    const response = deferred<BailianProviderResult>();
    provider.generate.mockImplementationOnce(() => { ready.resolve(); return response.promise; });
    const running = service.execute(id, 0);
    await ready.promise;
    await repository.transition(parent, "CANCELLED");
    await service.cancelPending(String(parent.id));
    const updates: string[] = [];
    const waiting = service.waitForResult(id, undefined, (item) => { updates.push(item.status); });
    response.resolve(providerResult);
    await running;
    expect((await waiting).status).toBe("SUCCEEDED");
    expect(updates.at(-1)).toBe("SUCCEEDED");
    expect(events.publish.mock.calls.at(-1)?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ creationId: String(parent.id), item: expect.objectContaining({ status: "SUCCEEDED" }) }),
    ]));
  });

  it("expires undispatched work even when no consumer is available", async () => {
    const { service, provider } = taskService();
    const { id } = await imageTask(service);
    await sql`UPDATE executions SET created_at = ${new Date(Date.now() - 70_000)} WHERE id = ${id}`.execute(db);
    expect((await service.queued()).some((row) => row.id === id)).toBe(false);
    await service.execute(id, 0);
    expect(await service.waitForResult(id)).toMatchObject({ status: "FAILED", code: "GENERATION_QUEUE_TIMEOUT" });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("does not retry a transport failure and tells the parent loop to stop", async () => {
    const { service, provider } = taskService();
    const { id } = await imageTask(service);
    provider.generate.mockRejectedValueOnce(new BailianTransportError(new Error("connection lost")));
    await service.execute(id, 0);
    await service.execute(id, 0);
    expect(provider.generate).toHaveBeenCalledTimes(1);
    await expect(service.waitForResult(id)).rejects.toBeInstanceOf(GenerationOutcomeUnknownError);
  });

  it("expires a quota-reserved task during rate waiting without issuing its model request", async () => {
    const { service, limiter, provider } = taskService();
    const { id } = await imageTask(service);
    const ready = deferred<void>();
    limiter.run.mockImplementationOnce((_call, signal) => new Promise((_resolve, reject) => {
      signal!.addEventListener("abort", () => reject(new DOMException("expired", "AbortError")), { once: true });
      ready.resolve();
    }));
    const running = service.execute(id, 0);
    await ready.promise;
    await sql`UPDATE executions SET created_at = ${new Date(Date.now() - 70_000)} WHERE id = ${id}`.execute(db);
    expect(await service.waitForResult(id)).toMatchObject({ status: "FAILED", code: "GENERATION_QUEUE_TIMEOUT" });
    await running;
    expect(provider.generate).not.toHaveBeenCalled();
    const row = (await sql<{ quota_refunded_at: unknown }>`SELECT quota_refunded_at FROM executions WHERE id = ${id}`.execute(db)).rows[0];
    expect(row?.quota_refunded_at).toBeTruthy();
  });

  it("treats gateway server errors as unknown but returns explicit provider rejections normally", async () => {
    const { service, provider } = taskService();
    const unknown = await imageTask(service);
    provider.generate.mockRejectedValueOnce(new BailianProviderError(502, "BadGateway", null, "gateway interrupted"));
    await service.execute(unknown.id, 0);
    await expect(service.waitForResult(unknown.id)).rejects.toBeInstanceOf(GenerationOutcomeUnknownError);
    const rejected = await imageTask(service);
    provider.generate.mockRejectedValueOnce(new BailianProviderError(400, "InvalidParameter", null, "rejected"));
    await service.execute(rejected.id, 0);
    expect(await service.waitForResult(rejected.id)).toMatchObject({ status: "FAILED", code: "GENERATION_FAILED" });
  });

  it("recovers saved provider results using transfer only and fails ambiguous started calls", async () => {
    const { service, provider } = taskService();
    const saved = await imageTask(service);
    const ambiguous = await imageTask(service);
    const settlement = new GenerationSettlement(db, { daily: 1000, concurrent: 200 }, (key) => `https://images.test/${key}`);
    for (const id of [saved.id, ambiguous.id]) {
      await sql`UPDATE executions SET status = 'RUNNING', revision = 1, provider_started_at = UTC_TIMESTAMP(3) WHERE id = ${id}`.execute(db);
      await settlement.reserve(id);
    }
    await sql`UPDATE executions SET provider_response_json = ${JSON.stringify(providerResult)} WHERE id = ${saved.id}`.execute(db);
    await service.recover();
    const recovered = await repository.get(saved.id);
    expect(recovered.status).toBe("QUEUED");
    await service.execute(saved.id, recovered.revision);
    expect((await service.waitForResult(saved.id)).status).toBe("SUCCEEDED");
    await expect(service.waitForResult(ambiguous.id)).rejects.toBeInstanceOf(GenerationOutcomeUnknownError);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("retries transfer after an infrastructure error without issuing another model request", async () => {
    const { service, provider, transfer } = taskService();
    const { id } = await imageTask(service);
    transfer.transfer.mockRejectedValueOnce(new Error("temporary storage failure"));
    await expect(service.execute(id, 0)).rejects.toThrow("temporary storage");
    await service.execute(id, 0);
    expect((await service.waitForResult(id)).status).toBe("SUCCEEDED");
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(transfer.transfer).toHaveBeenCalledTimes(2);
  });

  it("falls back to database completion when a notification is absent and aborts a detached waiter", async () => {
    const { service } = taskService();
    const { id } = await imageTask(service);
    await sql`UPDATE executions SET status = 'RUNNING', revision = 1 WHERE id = ${id}`.execute(db);
    const settlement = new GenerationSettlement(db, { daily: 1000, concurrent: 200 }, (key) => `https://images.test/${key}`);
    await settlement.reserve(id);
    const reading = deferred<void>();
    const waiting = service.waitForResult(id, undefined, (item) => { if (item.status === "RUNNING") reading.resolve(); });
    await reading.promise;
    // This persistence path intentionally sends no in-process event.
    await settlement.settle(id, []);
    expect((await waiting).status).toBe("FAILED");
    const queued = await imageTask(service);
    const abort = new AbortController();
    const detached = service.waitForResult(queued.id, abort.signal, () => abort.abort(new DOMException("cancelled", "AbortError")));
    await expect(detached).rejects.toMatchObject({ name: "AbortError" });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

