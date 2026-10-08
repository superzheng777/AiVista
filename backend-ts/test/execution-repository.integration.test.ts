import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection } from "mysql2/promise";
import { createPool } from "mysql2";
import { Kysely, MysqlDialect, sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadJavaLocalEnvironment } from "../src/config/java-local-environment.js";
import type { DatabaseSchema } from "../src/database/database.types.js";
import { ExecutionRepository, type CreateCreation } from "../src/sessions/execution-repository.js";
import { SessionStore } from "../src/sessions/session-store.js";
import { GenerationSettlement } from "../src/sessions/generation-settlement.js";

const enabled = process.env.AIVISTA_NATIVE_SCHEMA_TEST === "true";
describe.skipIf(!enabled)("Unified execution SQL integration", () => {
  let db: Kysely<DatabaseSchema>;
  let repository: ExecutionRepository;
  let root: string;
  let userId: string;
  const database = `aivista_native_test_${process.pid}`;
  const config = loadJavaLocalEnvironment("../backend/aivista/src/main/resources/application-local.yaml", process.env);
  const connection = { host: String(config.AIVISTA_DB_HOST), port: Number(config.AIVISTA_DB_PORT),
    user: String(config.AIVISTA_DB_USERNAME), password: String(config.AIVISTA_DB_PASSWORD), timezone: "Z" };

  beforeAll(async () => {
    const admin = await createConnection({ ...connection, multipleStatements: true });
    // No IF NOT EXISTS: never reuse or erase an unrelated database.
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`USE \`${database}\``);
    await admin.query(readFileSync("../backend/aivista/src/main/resources/db/migration/V1__initialize_schema.sql", "utf8"));
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
});

