import { sql, type Kysely, type Transaction } from "kysely";
import { z } from "zod";
import type { DatabaseSchema } from "../database/database.types.js";
import { CREATION_LIMIT, creationSettingsSchema, idSchema, type CreationStart,
  type ExecutionSnapshot, type ExecutionStatus, type AssetReference } from "./session-contract.js";
import { SessionStore } from "./session-store.js";

export const createCreationSchema = z.object({
  sessionId: idSchema.optional(),
  mode: z.enum(["NORMAL", "AGENT"]),
  input: z.object({ prompt: z.string().trim().min(1).max(1000),
    assetIds: z.array(idSchema).max(3).default([]) }).strict(),
  settings: creationSettingsSchema.default({}),
}).strict().superRefine((value, context) => {
  if (new Set(value.input.assetIds).size !== value.input.assetIds.length) {
    context.addIssue({ code: "custom", path: ["input", "assetIds"], message: "Duplicate asset IDs" });
  }
  if (value.mode === "NORMAL" && (!value.settings.aspectRatio || !value.settings.imageCount)) {
    context.addIssue({ code: "custom", path: ["settings"], message: "Normal generation requires aspectRatio and imageCount" });
  }
});
export type CreateCreation = z.infer<typeof createCreationSchema>;
export interface ExecutionRow {
  id: string; user_id: string; session_id: string; parent_id: string | null;
  kind: "CREATION" | "GENERATION"; mode: "NORMAL" | "AGENT";
  status: ExecutionStatus; revision: number; request_json: string | CreationStart;
  pending_tool_call_id: string | null; created_at: Date; completed_at: Date | null; failure_code: string | null;
}
export interface SessionRow {
  id: string; user_id: string; title: string; creation_count: number;
  created_at: Date; last_message_at: Date; deleted_at: Date | null;
}
export class ExecutionConflict extends Error {
  constructor(readonly code: "SESSION_CREATION_LIMIT" | "SESSION_BUSY" | "REVISION_CONFLICT" | "NOT_FOUND") {
    super(code);
  }
}

/** SQL owns execution identity and transitions. The native file owns conversational content. */
export class ExecutionRepository {
  constructor(private readonly db: Kysely<DatabaseSchema>, private readonly sessions: SessionStore) {}

  async create(userId: string, request: CreateCreation, assets: AssetReference[]): Promise<ExecutionRow> {
    return this.db.transaction().execute(async (transaction) => {
      let sessionId = request.sessionId;
      let isNew = false;
      if (!sessionId) {
        const user = await sql`SELECT id FROM users WHERE id = ${userId}`.execute(transaction);
        if (!user.rows.length) throw new ExecutionConflict("NOT_FOUND");
        const inserted = await sql`INSERT INTO generation_sessions
          (user_id, title, creation_count, last_message_at) VALUES
          (${userId}, ${Array.from(request.input.prompt).slice(0, 40).join("")}, 0, UTC_TIMESTAMP(3))`.execute(transaction);
        sessionId = inserted.insertId!.toString();
        isNew = true;
      }
      // Existing sessions are locked before the first snapshot read of active executions.
      const session = await this.ownedSession(userId, sessionId, transaction, true);
      if (session.creation_count >= CREATION_LIMIT) throw new ExecutionConflict("SESSION_CREATION_LIMIT");
      const active = await sql`SELECT id FROM executions WHERE session_id = ${sessionId}
        AND status IN ('QUEUED', 'RUNNING', 'WAITING_INPUT') LIMIT 1`.execute(transaction);
      if (active.rows.length) throw new ExecutionConflict("SESSION_BUSY");
      const inserted = await sql`INSERT INTO executions
        (user_id, session_id, kind, mode, status, request_json) VALUES
        (${userId}, ${sessionId}, 'CREATION', ${request.mode}, 'QUEUED', '{}')`.execute(transaction);
      const creationId = inserted.insertId!.toString();
      const start: CreationStart = { creationId, mode: request.mode,
        input: { prompt: request.input.prompt, assets }, settings: request.settings };
      await sql`UPDATE executions SET request_json = ${JSON.stringify(start)} WHERE id = ${creationId}`.execute(transaction);
      const manager = isNew ? this.sessions.create(userId, sessionId) : this.sessions.open(userId, sessionId);
      this.sessions.start(manager, start);
      await sql`UPDATE generation_sessions SET creation_count = creation_count + 1,
        last_message_at = UTC_TIMESTAMP(3) WHERE id = ${sessionId}`.execute(transaction);
      return this.get(creationId, transaction);
    });
  }

  async ownedSession(userId: string, sessionId: string, db: Kysely<DatabaseSchema> = this.db,
      lock = false): Promise<SessionRow> {
    const query = sql<SessionRow>`SELECT * FROM generation_sessions
      WHERE id = ${sessionId} AND user_id = ${userId} AND deleted_at IS NULL`;
    const result = await (lock ? sql<SessionRow>`${query} FOR UPDATE` : query).execute(db);
    if (!result.rows[0]) throw new ExecutionConflict("NOT_FOUND");
    return result.rows[0];
  }

  async list(userId: string): Promise<SessionRow[]> {
    return (await sql<SessionRow>`SELECT * FROM generation_sessions WHERE user_id = ${userId} AND deleted_at IS NULL
      ORDER BY last_message_at DESC, id DESC`.execute(this.db)).rows;
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.db.transaction().execute(async (transaction) => {
      const session = (await sql<SessionRow>`SELECT * FROM generation_sessions
        WHERE id = ${sessionId} AND user_id = ${userId} FOR UPDATE`.execute(transaction)).rows[0];
      if (!session) throw new ExecutionConflict("NOT_FOUND");
      if (session.deleted_at) return;
      // A cancelled parent may still have an accepted image request being settled.
      const active = await sql`SELECT id FROM executions WHERE session_id = ${sessionId}
        AND status IN ('QUEUED', 'RUNNING', 'WAITING_INPUT') LIMIT 1`.execute(transaction);
      if (active.rows.length) throw new ExecutionConflict("SESSION_BUSY");
      await sql`UPDATE generation_sessions SET deleted_at = UTC_TIMESTAMP(3)
        WHERE id = ${sessionId}`.execute(transaction);
    });
  }

  async renameSession(userId: string, sessionId: string, title: string): Promise<void> {
    await this.db.transaction().execute(async (transaction) => {
      await this.ownedSession(userId, sessionId, transaction, true);
      await sql`UPDATE generation_sessions SET title = ${title} WHERE id = ${sessionId}`.execute(transaction);
    });
  }

  async get(id: string, db: Kysely<DatabaseSchema> = this.db): Promise<ExecutionRow> {
    const result = await sql<ExecutionRow>`SELECT * FROM executions WHERE id = ${id}`.execute(db);
    if (!result.rows[0]) throw new ExecutionConflict("NOT_FOUND");
    return result.rows[0];
  }

  async history(sessionId: string): Promise<ExecutionSnapshot[]> {
    const rows = (await sql<ExecutionRow>`SELECT * FROM executions WHERE session_id = ${sessionId}
      AND kind = 'CREATION' ORDER BY id`.execute(this.db)).rows;
    return rows.map((row) => ({ creationId: String(row.id), status: row.status, revision: row.revision,
      failureCode: row.failure_code, completedAt: row.completed_at?.toISOString() ?? null }));
  }

  async claim(id: string, expectedRevision: number): Promise<ExecutionRow | null> {
    const result = await sql`UPDATE executions SET status = 'RUNNING', revision = revision + 1
      WHERE id = ${id} AND status = 'QUEUED' AND revision = ${expectedRevision}`.execute(this.db);
    if (result.numAffectedRows !== 1n) return null;
    const row = await this.get(id);
    return row.status === "RUNNING" && row.revision === expectedRevision + 1 ? row : null;
  }

  async transition(row: ExecutionRow, status: ExecutionStatus, options: {
    failureCode?: string; pendingToolCallId?: string;
  } = {}): Promise<boolean> {
    const terminal = ["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED"].includes(status);
    const result = await sql`UPDATE executions SET status = ${status}, revision = revision + 1,
      failure_code = ${options.failureCode ?? null}, pending_tool_call_id = ${options.pendingToolCallId ?? null},
      completed_at = ${terminal ? new Date() : null}
      WHERE id = ${row.id} AND status = ${row.status} AND revision = ${row.revision}`.execute(this.db);
    return result.numAffectedRows === 1n;
  }

  async queued(): Promise<ExecutionRow[]> {
    return (await sql<ExecutionRow>`SELECT * FROM executions WHERE kind = 'CREATION'
      AND status = 'QUEUED' ORDER BY id LIMIT 100`
      .execute(this.db)).rows;
  }

  async recoverInterrupted(): Promise<void> {
    await sql`UPDATE executions SET status = 'FAILED', revision = revision + 1,
      failure_code = 'CREATION_INTERRUPTED', completed_at = UTC_TIMESTAMP(3)
      WHERE kind = 'CREATION' AND status = 'RUNNING'`.execute(this.db);
  }

  async locked<T>(id: string, action: (row: ExecutionRow, transaction: Transaction<DatabaseSchema>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (transaction) => {
      const result = await sql<ExecutionRow>`SELECT * FROM executions WHERE id = ${id} FOR UPDATE`.execute(transaction);
      if (!result.rows[0]) throw new ExecutionConflict("NOT_FOUND");
      return action(result.rows[0], transaction);
    });
  }
}
