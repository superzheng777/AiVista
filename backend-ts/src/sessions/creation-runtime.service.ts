import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql, type Selectable } from "kysely";
import { z } from "zod";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import type { GenerationExecution } from "../database/database.types.js";
import { AgentModelService } from "../agent/agent-model.service.js";
import { AGENT_PROJECT_ROOT, runAgentPrompt } from "../agent/agent-runtime.js";
import { createGenerationTools, type GenerationToolRequest } from "../agent/tools/generation.js";
import { createSkillReadTool } from "../agent/tools/skill-read.js";
import { createRequestUserInputTool } from "../agent/tools/request-user-input.js";
import { createInspectImageTool } from "../agent/tools/inspect-image.js";
import { GenerationBailianClientService } from "../generation/generation-bailian-client.service.js";
import { GenerationImageTransferService } from "../generation/generation-image-transfer.service.js";
import { GenerationImageUrlService } from "../generation/generation-image-url.service.js";
import { GenerationProviderCallGateService } from "../generation/generation-provider-call-gate.service.js";
import { acceptFormAnswer, assetReferenceSchema, CREATION_LIMIT, creationStartSchema,
  type AssetReference, type CreationItem, type CreationStart } from "./session-contract.js";
import { createCreationSchema, ExecutionConflict, ExecutionRepository, type ExecutionRow } from "./execution-repository.js";
import { FORM_ANSWER, SessionStore } from "./session-store.js";
import { runNormalGeneration } from "./normal-generation.js";
import { projectSession } from "./session-projector.js";
import { imageReferenceText, injectModelImages } from "./model-images.js";
import { RuntimeEventClient } from "./runtime-event-client.js";
import { GenerationQuotaError, GenerationSettlement } from "./generation-settlement.js";
import { RuntimeEvents } from "./runtime-events.js";

import { AgentObservabilityService } from "../observability/agent-observability.service.js";

const formResponseSchema = z.object({ expectedRevision: z.number().int().nonnegative(),
  action: z.enum(["SUBMITTED", "SKIPPED"]), values: z.record(z.string(), z.string()).optional() }).strict();

@Injectable()
export class CreationRuntimeService {
  private readonly logger = new Logger(CreationRuntimeService.name);
  readonly store: SessionStore;
  readonly executions: ExecutionRepository;
  readonly settlement: GenerationSettlement;
  private readonly running = new Map<string, AbortController>();
  private readonly activeSessions = new Set<string>();
  private readonly deliveries = new Map<string, Promise<void>>();
  constructor(private readonly config: ConfigService<Environment, true>, private readonly database: DatabaseService,
      private readonly model: AgentModelService, private readonly eventClient: RuntimeEventClient,
      private readonly provider: GenerationBailianClientService, private readonly transfer: GenerationImageTransferService,
      private readonly images: GenerationImageUrlService, private readonly gate: GenerationProviderCallGateService,
      private readonly observability: AgentObservabilityService) {
    this.store = new SessionStore(config.get("AIVISTA_SESSION_DIRECTORY", { infer: true }), AGENT_PROJECT_ROOT);
    this.executions = new ExecutionRepository(database.db, this.store);
    this.settlement = new GenerationSettlement(database.db, {
      daily: config.get("AIVISTA_GENERATION_DAILY_IMAGE_QUOTA", { infer: true }),
      concurrent: config.get("AIVISTA_GENERATION_MAX_ACTIVE_PER_USER", { infer: true }),
    }, (key) => images.unsigned(key));
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
    return { sessionId: String(row.session_id), turn: await this.turn(userId, String(row.id)) };
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
      turns: projectSession(this.store.open(userId, sessionId).getBranch(), states) };
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
      await sql`UPDATE executions SET status = 'QUEUED', revision = revision + 1, dispatched_at = NULL
        WHERE id = ${creationId}`.execute(transaction);
      return true;
    });
    const turn = await this.turn(userId, creationId);
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
    const row = await this.executions.claim(creationId, expectedRevision);
    if (!row) return;
    const controller = new AbortController();
    this.running.set(creationId, controller);
    this.activeSessions.add(String(row.session_id));
    const events = new RuntimeEvents(this.eventClient);
    const envelope = { userId: String(row.user_id), sessionId: String(row.session_id), creationId };
    const emit = (item: CreationItem) => events.push({ ...envelope, type: "creation.item.upserted", item });
    const refresh = async (manager: SessionManager) => {
      const turns = projectSession(manager.getBranch(), await this.executions.history(envelope.sessionId));
      for (const item of turns.find((turn) => turn.creationId === creationId)?.items ?? []) emit(item);
    };
    events.push({ ...envelope, type: "creation.updated", status: row.status, revision: row.revision });
    let manager: SessionManager | undefined;
    try {
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
      const generate = async (toolCallId: string, request: GenerationToolRequest) => {
        const result = await this.generate(row, start, toolCallId, request, references, emit);
        for (const asset of result.assets) { references.set(asset.assetId, asset); authorized.add(asset.assetId); }
        return result;
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
          revision: row.revision, resumed: !!row.pending_tool_call_id, prompt: start.input.prompt, signal: controller.signal },
          async (observer) => runAgentPrompt({ ...(observer ? { observer } : {}), binding: await this.model.get(), sessionManager: activeManager,
          prompt: row.pending_tool_call_id ? "请根据用户已提交的表单回答继续当前创作。"
            : [start.input.prompt, ...start.input.assets.map(imageReferenceText)].join("\n"),
          tools, authorizedInputAssetIds: [...authorized],
          generationConstraints: { aspectRatio: start.settings.aspectRatio ?? "AUTO", imageCount: start.settings.imageCount ?? 0 },
          maxTurns: this.config.get("AIVISTA_AGENT_MAX_TURNS", { infer: true }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(this.config.get("AIVISTA_AGENT_LOOP_TIMEOUT_MS", { infer: true }))]),
          adaptProviderRequest: (payload) => injectModelImages(payload, references, (url) => this.images.signReference(url)),
          onItem: emit,
        }));
        if (result.outcome === "WAITING_FOR_USER") {
          await this.executions.transition(row, "WAITING_INPUT", { pendingToolCallId: result.request.toolCallId });
        } else await this.executions.transition(row, "SUCCEEDED");
      }
    } catch (error) {
      this.logger.error(`Creation ${creationId} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      if (!controller.signal.aborted) await this.executions.transition(row, "FAILED", { failureCode: "CREATION_FAILED" });
    } finally {
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

  private async generate(parent: ExecutionRow, start: CreationStart, toolCallId: string,
      request: GenerationToolRequest, references: ReadonlyMap<string, AssetReference>, emit: (item: CreationItem) => void) {
    const dimensions = { "1:1": [2048, 2048], "16:9": [2688, 1536], "9:16": [1536, 2688], "4:3": [2368, 1728], "3:4": [1728, 2368] }[request.aspectRatio];
    if (!dimensions) throw new Error("Unsupported aspect ratio");
    const prepared = { model: this.config.get("AIVISTA_GENERATION_MODEL", { infer: true }), width: dimensions[0]!, height: dimensions[1]!,
      assets: request.inputAssetIds.map((id) => {
        const asset = references.get(id);
        if (!asset) throw new Error("Unauthorized generation input");
        return asset;
      }) };
    const inserted = await this.executions.locked(String(parent.id), async (current, transaction) => {
      if (current.status !== "RUNNING" || current.revision !== parent.revision) throw new ExecutionConflict("REVISION_CONFLICT");
      const allowed = new Set(references.keys());
      if (request.inputAssetIds.some((id) => !allowed.has(id))) throw new Error("Unauthorized generation input");
      if (start.settings.aspectRatio && request.aspectRatio !== start.settings.aspectRatio) throw new Error("Aspect ratio constraint mismatch");
      const used = await sql<{ count: string }>`SELECT COALESCE(SUM(requested_image_count), 0) AS count
        FROM executions WHERE parent_id = ${parent.id} AND status <> 'FAILED'`.execute(transaction);
      if (start.settings.imageCount && Number(used.rows[0]?.count ?? 0) + request.imageCount > start.settings.imageCount) {
        throw new Error("Image count exceeds creation limit");
      }
      return sql`INSERT INTO executions (user_id, session_id, parent_id, kind, mode, tool_call_id, status,
        request_json, operation, model, final_prompt, final_negative_prompt, width, height, prompt_extend, requested_image_count)
        VALUES (${parent.user_id}, ${parent.session_id}, ${parent.id}, 'GENERATION', ${parent.mode}, ${toolCallId}, 'QUEUED',
        ${JSON.stringify({ ...request, assets: prepared.assets })}, ${request.operation}, ${prepared.model}, ${request.prompt},
        ${request.negativePrompt}, ${prepared.width}, ${prepared.height}, ${request.promptExtend},
        ${request.imageCount})`.execute(transaction);
    });
    const generationId = inserted.insertId!.toString();
    if (!await this.executions.claim(generationId, 0)) throw new Error("Generation claim failed");
    const item = { id: toolCallId, kind: "generation" as const, generationId,
      status: "RUNNING" as const, assets: [] as AssetReference[] };
    emit(item);
    let result: Awaited<ReturnType<GenerationSettlement["settle"]>>;
    try {
      await this.settlement.reserve(generationId);
      const task = (await sql<Selectable<GenerationExecution>>`SELECT * FROM executions WHERE id = ${generationId}`
        .execute(this.database.db)).rows[0]!;
      const release = await this.gate.acquire();
      try {
        const generated = await this.provider.generate(task, prepared.assets);
        result = await this.settlement.settle(generationId, await this.transfer.transfer(task, generated.imageUrls), generated.requestId);
      } finally { release(); }
    } catch (error) {
      this.logger.warn(`Generation ${generationId} failed: ${error instanceof Error ? error.message : "unknown error"}`);
      result = await this.settlement.settle(generationId, [], null, error instanceof GenerationQuotaError ? error.code : "GENERATION_FAILED");
    }
    const { status, assets } = result;
    emit({ ...item, status, assets });
    return { generationId, status, assets } as const;
  }
}
