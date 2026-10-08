import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql } from "kysely";
import { z } from "zod";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import { AgentModelService } from "../agent/agent-model.service.js";
import { AGENT_PROJECT_ROOT, runAgentPrompt } from "../agent/agent-runtime.js";
import { createGenerationTools, type GenerationToolRequest } from "../agent/tools/generation.js";
import { createSkillReadTool } from "../agent/tools/skill-read.js";
import { createRequestUserInputTool } from "../agent/tools/request-user-input.js";
import { createInspectImageTool } from "../agent/tools/inspect-image.js";
import { GenerationImageUrlService } from "../generation/generation-image-url.service.js";
import { acceptFormAnswer, assetReferenceSchema, CREATION_LIMIT, creationStartSchema,
  type AssetReference, type CreationItem } from "./session-contract.js";
import { createCreationSchema, ExecutionConflict, ExecutionRepository } from "./execution-repository.js";
import { FORM_ANSWER, SessionStore } from "./session-store.js";
import { runNormalGeneration } from "./normal-generation.js";
import { projectSession } from "./session-projector.js";
import { imageReferenceText, injectModelImages } from "./model-images.js";
import { RuntimeEventClient } from "./runtime-event-client.js";
import { GenerationTaskService, GenerationOutcomeUnknownError } from "./generation-task.service.js";
import { ActiveExecutionTimeout } from "./active-execution-timeout.js";
import { RuntimeEvents } from "./runtime-events.js";

import { AgentObservabilityService } from "../observability/agent-observability.service.js";

const formResponseSchema = z.object({ expectedRevision: z.number().int().nonnegative(),
  action: z.enum(["SUBMITTED", "SKIPPED"]), values: z.record(z.string(), z.string()).optional() }).strict();

@Injectable()
export class CreationRuntimeService {
  private readonly logger = new Logger(CreationRuntimeService.name);
  readonly store: SessionStore;
  readonly executions: ExecutionRepository;
  onQueued: (() => void) | undefined;
  private readonly running = new Map<string, AbortController>();
  private readonly activeSessions = new Set<string>();
  private readonly deliveries = new Map<string, Promise<void>>();
  constructor(private readonly config: ConfigService<Environment, true>, private readonly database: DatabaseService,
      private readonly model: AgentModelService, private readonly eventClient: RuntimeEventClient,
      private readonly images: GenerationImageUrlService, private readonly tasks: GenerationTaskService,
      private readonly observability: AgentObservabilityService) {
    this.store = new SessionStore(config.get("AIVISTA_SESSION_DIRECTORY", { infer: true }), AGENT_PROJECT_ROOT);
    this.executions = new ExecutionRepository(database.db, this.store);
  }

  async create(userId: string, body: unknown) {
    const trusted = z.object({ request: createCreationSchema, assets: assetReferenceSchema.array().max(3) }).parse(body);
    if (trusted.request.sessionId && this.activeSessions.has(trusted.request.sessionId)) throw new ExecutionConflict("SESSION_BUSY");
    if (trusted.request.mode === "AGENT" && !this.config.get("AIVISTA_AGENT_ENABLED", { infer: true })) {
      throw new Error("Agent mode is disabled");
    }
    if (JSON.stringify(trusted.request.input.assetIds) !== JSON.stringify(trusted.assets.map((asset) => asset.assetId))) {
      throw new Error("Authorized image references do not match the requested assets");
    }
    const row = await this.executions.create(userId, trusted.request, trusted.assets);
    const result = { sessionId: String(row.session_id), turn: await this.turn(userId, String(row.id)) };
    this.onQueued?.();
    return result;
  }

  async list(userId: string) {
    const rows = await this.executions.list(userId);
    return rows.map((row) => ({ sessionId: String(row.id), title: row.title,
      creationCount: row.creation_count, lastMessageAt: row.last_message_at.toISOString() }));
  }

  async history(userId: string, sessionId: string) {
    const row = await this.executions.ownedSession(userId, sessionId);
    const states = await this.executions.history(sessionId);
    return { schemaVersion: 1, sessionId, title: row.title, lastMessageAt: row.last_message_at.toISOString(), creationCount: row.creation_count,
      creationLimit: CREATION_LIMIT,
      turns: projectSession(this.store.open(userId, sessionId).getBranch(), states, await this.tasks.history(sessionId)) };
  }

  async turn(userId: string, creationId: string) {
    const row = await this.executions.get(creationId);
    if (String(row.user_id) !== userId || row.kind !== "CREATION") throw new ExecutionConflict("NOT_FOUND");
    const history = await this.history(userId, String(row.session_id));
    const turn = history.turns.find((turn) => turn.creationId === creationId);
    if (!turn) throw new Error("Creation history is missing");
    return turn;
  }

  async title(userId: string, sessionId: string, body: unknown) {
    const { title } = z.object({ title: z.string().trim().min(1).max(100) }).strict().parse(body);
    await this.executions.ownedSession(userId, sessionId);
    await sql`UPDATE generation_sessions SET title = ${title} WHERE id = ${sessionId}`.execute(this.database.db);
    return { sessionId, title };
  }

  async answer(userId: string, creationId: string, toolCallId: string, body: unknown) {
    const request = formResponseSchema.parse(body);
    const changed = await this.executions.locked(creationId, async (row, transaction) => {
      if (String(row.user_id) !== userId || row.kind !== "CREATION") throw new ExecutionConflict("NOT_FOUND");
      const turn = await this.turn(userId, creationId);
      const item = turn.items.find((item) => item.kind === "form" && item.toolCallId === toolCallId);
      if (item?.kind !== "form") throw new ExecutionConflict("NOT_FOUND");
      const answer = acceptFormAnswer(creationId, item, request.action, request.values);
      if (item.status === request.action && item.fields.every((field, index) => field.value === answer.fields[index]?.value)) return false;
      if (row.status !== "WAITING_INPUT" || row.revision !== request.expectedRevision
          || row.pending_tool_call_id !== toolCallId || item.status !== "PENDING") {
        throw new ExecutionConflict("REVISION_CONFLICT");
      }
      this.store.open(userId, String(row.session_id))
        .appendCustomMessageEntry(FORM_ANSWER, JSON.stringify(answer), false);
      await sql`UPDATE executions SET status = 'QUEUED', revision = revision + 1
        WHERE id = ${creationId}`.execute(transaction);
      return true;
    });
    const turn = await this.turn(userId, creationId);
    if (changed) this.onQueued?.();
    return { changed, creationId, status: turn.status, revision: turn.revision,
      item: turn.items.find((item) => item.id === toolCallId) };
  }

  async cancel(userId: string, creationId: string) {
    await this.executions.locked(creationId, async (row, transaction) => {
      if (String(row.user_id) !== userId || row.kind !== "CREATION") throw new ExecutionConflict("NOT_FOUND");
      if (row.status === "CANCELLED") return;
      if (!["QUEUED", "RUNNING", "WAITING_INPUT"].includes(row.status)) throw new ExecutionConflict("REVISION_CONFLICT");
      await sql`UPDATE executions SET status = 'CANCELLED', revision = revision + 1,
        completed_at = UTC_TIMESTAMP(3) WHERE id = ${creationId}`.execute(transaction);
    });
    this.running.get(creationId)?.abort("USER_CANCELLED");
    await this.tasks.cancelPending(creationId);
    const turn = await this.turn(userId, creationId);
    await this.eventClient.publish([{ userId, sessionId: String((await this.executions.get(creationId)).session_id),
      creationId, type: "creation.updated", status: turn.status, revision: turn.revision }]).catch(() => undefined);
    return { creationId, status: turn.status, revision: turn.revision };
  }

  async execute(creationId: string, expectedRevision: number): Promise<void> {
    const prior = this.deliveries.get(creationId);
    if (prior) { await prior; return this.execute(creationId, expectedRevision); }
    const delivery = this.run(creationId, expectedRevision);
    this.deliveries.set(creationId, delivery);
    try { await delivery; } finally {
      if (this.deliveries.get(creationId) === delivery) this.deliveries.delete(creationId);
    }
  }

  private async run(creationId: string, expectedRevision: number): Promise<void> {
    const controller = new AbortController();
    this.running.set(creationId, controller);
    const row = await this.executions.claim(creationId, expectedRevision).catch((error: unknown) => {
      this.running.delete(creationId);
      throw error;
    });
    if (!row) { this.running.delete(creationId); return; }
    const budget = row.mode === "AGENT"
      ? new ActiveExecutionTimeout(this.config.get("AIVISTA_AGENT_LOOP_TIMEOUT_MS", { infer: true })) : undefined;
    const signal = budget ? AbortSignal.any([controller.signal, budget.signal]) : controller.signal;
    this.activeSessions.add(String(row.session_id));
    const events = new RuntimeEvents(this.eventClient);
    const envelope = { userId: String(row.user_id), sessionId: String(row.session_id), creationId };
    const emit = (item: CreationItem) => events.push({ ...envelope, type: "creation.item.upserted", item });
    const refresh = async (manager: SessionManager) => {
      const turns = projectSession(manager.getBranch(), await this.executions.history(envelope.sessionId),
        await this.tasks.history(envelope.sessionId));
      for (const item of turns.find((turn) => turn.creationId === creationId)?.items ?? []) emit(item);
    };
    events.push({ ...envelope, type: "creation.updated", status: row.status, revision: row.revision });
    let manager: SessionManager | undefined;
    try {
      signal.throwIfAborted();
      const start = creationStartSchema.parse(typeof row.request_json === "string" ? JSON.parse(row.request_json) : row.request_json);
      manager = this.store.open(envelope.userId, envelope.sessionId);
      const activeManager = manager;
      const references = new Map<string, AssetReference>();
      for (const turn of (await this.history(envelope.userId, envelope.sessionId)).turns) {
        for (const asset of turn.input.assets) references.set(asset.assetId, asset);
        for (const item of turn.items) if (item.kind === "generation") {
          for (const asset of item.assets) references.set(asset.assetId, asset);
        }
      }
      const authorized = new Set(references.keys());
      const generate = async (toolCallId: string, request: GenerationToolRequest, toolSignal?: AbortSignal) => {
        const resume = budget?.pause();
        try {
          signal.throwIfAborted();
          const item = await this.tasks.create(row, start, toolCallId, request, references);
          emit(item);
          const result = await this.tasks.waitForResult(item.generationId!,
            toolSignal ? AbortSignal.any([signal, toolSignal]) : signal, emit);
          for (const asset of result.assets) { references.set(asset.assetId, asset); authorized.add(asset.assetId); }
          return result;
        } catch (error) {
          // Stop the loop before the model can repeat an ambiguously accepted paid request.
          if (error instanceof GenerationOutcomeUnknownError) controller.abort(error);
          throw error;
        } finally { resume?.(); }
      };
      if (row.mode === "NORMAL") {
        const result = await runNormalGeneration(manager, start, generate);
        await this.executions.transition(row, result.status);
      } else {
        const tools = [createSkillReadTool(AGENT_PROJECT_ROOT), createRequestUserInputTool(),
          createInspectImageTool({ inspect: async (assetId) => {
            const asset = references.get(assetId);
            if (!asset) throw new Error("Image is outside this session");
            return { assetId, asset };
          } }), ...createGenerationTools({ authorizedInputAssetIds: authorized,
            constraints: { aspectRatio: start.settings.aspectRatio ?? "AUTO", imageCount: start.settings.imageCount ?? 0 },
            executor: { execute: generate } })];
        const result = await this.observability.traceAgentRun({ sessionId: envelope.sessionId, creationId,
          revision: row.revision, resumed: !!row.pending_tool_call_id, prompt: start.input.prompt, signal },
          async (observer) => runAgentPrompt({ ...(observer ? { observer } : {}), binding: await this.model.get(), sessionManager: activeManager,
          prompt: row.pending_tool_call_id ? "请根据用户已提交的表单回答继续当前创作。"
            : [start.input.prompt, ...start.input.assets.map(imageReferenceText)].join("\n"),
          tools, authorizedInputAssetIds: [...authorized],
          generationConstraints: { aspectRatio: start.settings.aspectRatio ?? "AUTO", imageCount: start.settings.imageCount ?? 0 },
          maxTurns: this.config.get("AIVISTA_AGENT_MAX_TURNS", { infer: true }),
          signal,
          adaptProviderRequest: (payload) => injectModelImages(payload, references, (url) => this.images.signReference(url)),
          onItem: emit,
        }));
        if (result.outcome === "WAITING_FOR_USER") {
          await this.executions.transition(row, "WAITING_INPUT", { pendingToolCallId: result.request.toolCallId });
        } else await this.executions.transition(row, "SUCCEEDED");
      }
    } catch (error) {
      this.logger.error(`Creation ${creationId} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      await this.executions.transition(row, "FAILED", { failureCode:
        controller.signal.reason instanceof GenerationOutcomeUnknownError ? "GENERATION_OUTCOME_UNKNOWN"
          : budget?.signal.aborted ? "AGENT_TIMEOUT" : "CREATION_FAILED" });
    } finally {
      budget?.dispose();
      if (manager) await refresh(manager).catch((error: unknown) => {
        this.logger.warn(`Creation ${creationId} projection failed: ${error instanceof Error ? error.message : "unknown error"}`);
      });
      this.running.delete(creationId);
      this.activeSessions.delete(String(row.session_id));
      const current = await this.executions.get(creationId);
      events.push({ ...envelope, type: "creation.updated", status: current.status, revision: current.revision });
      await events.close();
    }
  }

}
