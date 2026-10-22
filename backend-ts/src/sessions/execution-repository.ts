import { Prisma, queryRows, type PrismaClient, type TransactionClient } from "../database/prisma.js";
import { z } from "zod";
import { CREATION_LIMIT, creationSettingsSchema, idSchema, type CreationStart,
  type ExecutionSnapshot, type ExecutionStatus, type AssetReference } from "./session-contract.js";
import { SessionStore } from "./session-store.js";
import type { executions, generation_sessions } from "../generated/prisma/client.js";

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
  status: ExecutionStatus; revision: number; request_json: Prisma.JsonValue;
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

export function executionRow(row: executions): ExecutionRow {
  return { ...row, id: row.id.toString(), user_id: row.user_id.toString(), session_id: row.session_id.toString(),
    parent_id: row.parent_id?.toString() ?? null,
    kind: z.enum(["CREATION", "GENERATION"]).parse(row.kind), mode: z.enum(["NORMAL", "AGENT"]).parse(row.mode),
    status: z.enum(["QUEUED", "RUNNING", "WAITING_INPUT", "SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED"]).parse(row.status) };
}

function sessionRow(row: generation_sessions): SessionRow {
  return { ...row, id: row.id.toString(), user_id: row.user_id.toString() };
}

/** SQL owns execution identity and transitions. The native file owns conversational content. */
export class ExecutionRepository {
  constructor(private readonly db: PrismaClient, private readonly sessions: SessionStore) {}

  async create(userId: string, request: CreateCreation, assets: AssetReference[]): Promise<ExecutionRow> {
    return this.db.$transaction(async (transaction) => {
      let sessionId = request.sessionId;
      let isNew = false;
      if (!sessionId) {
        const user = await transaction.users.findUnique({ where: { id: BigInt(userId) }, select: { id: true } });
        if (!user) throw new ExecutionConflict("NOT_FOUND");
        const inserted = await transaction.generation_sessions.create({ data: {
          user_id: BigInt(userId), title: Array.from(request.input.prompt).slice(0, 40).join(""),
          creation_count: 0, last_message_at: new Date(),
        }, select: { id: true } });
        sessionId = inserted.id.toString();
        isNew = true;
      }
      // Existing sessions are locked before the first snapshot read of active executions.
      const session = await this.ownedSession(userId, sessionId, transaction, true);
      if (session.creation_count >= CREATION_LIMIT) throw new ExecutionConflict("SESSION_CREATION_LIMIT");
      const active = await transaction.executions.findFirst({ where: { session_id: BigInt(sessionId),
        status: { in: ["QUEUED", "RUNNING", "WAITING_INPUT"] } }, select: { id: true } });
      if (active) throw new ExecutionConflict("SESSION_BUSY");
      const inserted = await transaction.executions.create({ data: {
        user_id: BigInt(userId), session_id: BigInt(sessionId), kind: "CREATION", mode: request.mode,
        status: "QUEUED", request_json: {},
      }, select: { id: true } });
      const creationId = inserted.id.toString();
      const start: CreationStart = { creationId, mode: request.mode,
        input: { prompt: request.input.prompt, assets }, settings: request.settings };
      await transaction.executions.update({ where: { id: inserted.id }, data: { request_json: start } });
      const manager = isNew ? this.sessions.create(userId, sessionId) : this.sessions.open(userId, sessionId);
      this.sessions.start(manager, start);
      await transaction.generation_sessions.update({ where: { id: BigInt(sessionId) },
        data: { creation_count: { increment: 1 }, last_message_at: new Date() } });
      return this.get(creationId, transaction);
    });
  }

  async ownedSession(userId: string, sessionId: string, db: TransactionClient = this.db,
      lock = false): Promise<SessionRow> {
    if (!lock) {
      const row = await db.generation_sessions.findFirst({ where: {
        id: BigInt(sessionId), user_id: BigInt(userId), deleted_at: null,
      } });
      if (!row) throw new ExecutionConflict("NOT_FOUND");
      return sessionRow(row);
    }
    const result = await queryRows<SessionRow>(db, Prisma.sql`SELECT * FROM generation_sessions
      WHERE id = ${sessionId} AND user_id = ${userId} AND deleted_at IS NULL FOR UPDATE`);
    if (!result[0]) throw new ExecutionConflict("NOT_FOUND");
    return result[0];
  }

  async list(userId: string): Promise<SessionRow[]> {
    return (await this.db.generation_sessions.findMany({ where: { user_id: BigInt(userId), deleted_at: null },
      orderBy: [{ last_message_at: "desc" }, { id: "desc" }] })).map(sessionRow);
  }

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const session = (await queryRows<SessionRow>(transaction, Prisma.sql`SELECT * FROM generation_sessions
        WHERE id = ${sessionId} AND user_id = ${userId} FOR UPDATE`))[0];
      if (!session) throw new ExecutionConflict("NOT_FOUND");
      if (session.deleted_at) return;
      // A cancelled parent may still have an accepted image request being settled.
      const active = await transaction.executions.findFirst({ where: { session_id: BigInt(sessionId),
        status: { in: ["QUEUED", "RUNNING", "WAITING_INPUT"] } }, select: { id: true } });
      if (active) throw new ExecutionConflict("SESSION_BUSY");
      await transaction.generation_sessions.update({ where: { id: BigInt(sessionId) }, data: { deleted_at: new Date() } });
    });
  }

  async renameSession(userId: string, sessionId: string, title: string): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      await this.ownedSession(userId, sessionId, transaction, true);
      await transaction.generation_sessions.update({ where: { id: BigInt(sessionId) }, data: { title } });
    });
  }

  async get(id: string, db: TransactionClient = this.db): Promise<ExecutionRow> {
    const row = await db.executions.findUnique({ where: { id: BigInt(id) } });
    if (!row) throw new ExecutionConflict("NOT_FOUND");
    return executionRow(row);
  }

  async history(sessionId: string): Promise<ExecutionSnapshot[]> {
    const rows = (await this.db.executions.findMany({ where: { session_id: BigInt(sessionId), kind: "CREATION" },
      orderBy: { id: "asc" } })).map(executionRow);
    return rows.map((row) => ({ creationId: String(row.id), status: row.status, revision: row.revision,
      failureCode: row.failure_code, completedAt: row.completed_at?.toISOString() ?? null }));
  }

  async claim(id: string, expectedRevision: number): Promise<ExecutionRow | null> {
    const result = await this.db.executions.updateMany({ where: { id: BigInt(id), status: "QUEUED", revision: expectedRevision },
      data: { status: "RUNNING", revision: { increment: 1 } } });
    if (result.count !== 1) return null;
    const row = await this.get(id);
    return row.status === "RUNNING" && row.revision === expectedRevision + 1 ? row : null;
  }

  async transition(row: ExecutionRow, status: ExecutionStatus, options: {
    failureCode?: string; pendingToolCallId?: string;
  } = {}): Promise<boolean> {
    const terminal = ["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED"].includes(status);
    const result = await this.db.executions.updateMany({ where: { id: BigInt(row.id), status: row.status, revision: row.revision },
      data: { status, revision: { increment: 1 }, failure_code: options.failureCode ?? null,
        pending_tool_call_id: options.pendingToolCallId ?? null, completed_at: terminal ? new Date() : null } });
    return result.count === 1;
  }

  async queued(): Promise<ExecutionRow[]> {
    return (await this.db.executions.findMany({ where: { kind: "CREATION", status: "QUEUED" },
      orderBy: { id: "asc" }, take: 100 })).map(executionRow);
  }

  async recoverInterrupted(): Promise<void> {
    await this.db.executions.updateMany({ where: { kind: "CREATION", status: "RUNNING" },
      data: { status: "FAILED", revision: { increment: 1 }, failure_code: "CREATION_INTERRUPTED", completed_at: new Date() } });
  }

  async locked<T>(id: string, action: (row: ExecutionRow, transaction: TransactionClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (transaction) => {
      const result = await queryRows<ExecutionRow>(transaction, Prisma.sql`SELECT * FROM executions WHERE id = ${id} FOR UPDATE`);
      if (!result[0]) throw new ExecutionConflict("NOT_FOUND");
      return action(result[0], transaction);
    });
  }
}
