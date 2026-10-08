import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql } from "kysely";
import type { Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import type { GenerationExecution } from "../database/database.types.js";
import type { GenerationToolRequest } from "../agent/tools/generation.js";
import { GenerationBailianClientService, type BailianProviderResult } from "../generation/generation-bailian-client.service.js";
import { GenerationImageTransferService } from "../generation/generation-image-transfer.service.js";
import { GenerationImageUrlService } from "../generation/generation-image-url.service.js";
import { GenerationRateLimiterService } from "../generation/generation-rate-limiter.service.js";
import { BailianProviderError } from "../generation/generation-provider-error.js";
import { ExecutionConflict, type ExecutionRow } from "./execution-repository.js";
import { GenerationQuotaError, GenerationSettlement } from "./generation-settlement.js";
import { RuntimeEventClient } from "./runtime-event-client.js";
import type { AssetReference, CreationStart, ExecutionStatus, GenerationItem, GenerationResult } from "./session-contract.js";

interface ImageTask extends GenerationExecution {
  tool_call_id: string; status: ExecutionStatus; created_at: Date; failure_code: string | null;
  request_json: string | (GenerationToolRequest & { assets: AssetReference[] });
  provider_started_at: Date | null; provider_response_json: string | BailianProviderResult | null;
}
type ActiveCall = { controller: AbortController; started: boolean };
const terminal = new Set<ExecutionStatus>(["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED"]);

/** This failure must stop the parent loop: asking the model to retry could double-charge. */
export class GenerationOutcomeUnknownError extends Error {
  readonly code = "GENERATION_OUTCOME_UNKNOWN";
  constructor(readonly generationId: string) {
    super("The image provider may have accepted this request; automatic retry is disabled");
    this.name = "GenerationOutcomeUnknownError";
  }
}

@Injectable()
export class GenerationTaskService {
  private readonly logger = new Logger(GenerationTaskService.name);
  private readonly settlement: GenerationSettlement;
  private readonly pending = new Map<string, ActiveCall>();
  private readonly deliveries = new Map<string, Promise<void>>();
  private readonly waiters = new Map<string, Set<() => void>>();
  private readonly queueTimeoutMs: number;

  constructor(private readonly config: ConfigService<Environment, true>, private readonly database: DatabaseService,
      private readonly provider: GenerationBailianClientService, private readonly transfer: GenerationImageTransferService,
      private readonly images: GenerationImageUrlService, private readonly limiter: GenerationRateLimiterService,
      private readonly events: RuntimeEventClient) {
    this.queueTimeoutMs = config.get("AIVISTA_GENERATION_QUEUE_TIMEOUT_MS", { infer: true });
    this.settlement = new GenerationSettlement(database.db, {
      daily: config.get("AIVISTA_GENERATION_DAILY_IMAGE_QUOTA", { infer: true }),
      concurrent: config.get("AIVISTA_GENERATION_MAX_ACTIVE_PER_USER", { infer: true }),
    }, (key) => images.unsigned(key));
  }

  async create(parent: ExecutionRow, start: CreationStart, toolCallId: string, request: GenerationToolRequest,
      references: ReadonlyMap<string, AssetReference>): Promise<GenerationItem> {
    const dimensions = { "1:1": [2048, 2048], "16:9": [2688, 1536], "9:16": [1536, 2688],
      "4:3": [2368, 1728], "3:4": [1728, 2368] }[request.aspectRatio];
    if (!dimensions || !Number.isInteger(request.imageCount) || request.imageCount < 1 || request.imageCount > 6) {
      throw new Error("Invalid generation settings");
    }
    const assets = request.inputAssetIds.map((id) => {
      const asset = references.get(id);
      if (!asset) throw new Error("Unauthorized generation input");
      return asset;
    });
    const snapshot = JSON.stringify({ ...request, assets });
    const id = await this.database.db.transaction().execute(async (transaction) => {
      const current = (await sql<ExecutionRow>`SELECT * FROM executions WHERE id = ${parent.id}
        AND kind = 'CREATION' FOR UPDATE`.execute(transaction)).rows[0];
      const existing = (await sql<ImageTask>`SELECT * FROM executions
        WHERE parent_id = ${parent.id} AND tool_call_id = ${toolCallId}`.execute(transaction)).rows[0];
      if (existing) {
        // Compare normalized fields; MySQL JSON objects do not preserve property order.
        const previous = parseJson(existing.request_json);
        if (Object.entries(request).some(([key, value]) => JSON.stringify(previous[key as keyof typeof previous]) !== JSON.stringify(value))) {
          throw new Error("A tool call cannot change its persisted image request");
        }
        return String(existing.id);
      }
      if (!current || current.status !== "RUNNING" || current.revision !== parent.revision) {
        throw new ExecutionConflict("REVISION_CONFLICT");
      }
      if (start.settings.aspectRatio && request.aspectRatio !== start.settings.aspectRatio) throw new Error("Aspect ratio constraint mismatch");
      const used = (await sql<{ count: string }>`SELECT COALESCE(SUM(requested_image_count), 0) AS count
        FROM executions WHERE parent_id = ${parent.id} AND kind = 'GENERATION'
          AND status NOT IN ('FAILED', 'CANCELLED')`.execute(transaction)).rows[0];
      if (start.settings.imageCount && Number(used?.count ?? 0) + request.imageCount > start.settings.imageCount) {
        throw new Error("Image count exceeds creation limit");
      }
      const inserted = await sql`INSERT INTO executions (user_id, session_id, parent_id, kind, mode, tool_call_id,
        status, request_json, operation, model, final_prompt, final_negative_prompt, width, height, prompt_extend, requested_image_count)
        VALUES (${parent.user_id}, ${parent.session_id}, ${parent.id}, 'GENERATION', ${parent.mode}, ${toolCallId},
        'QUEUED', ${snapshot}, ${request.operation}, ${this.config.get("AIVISTA_GENERATION_MODEL", { infer: true })},
        ${request.prompt}, ${request.negativePrompt}, ${dimensions[0]!}, ${dimensions[1]!}, ${request.promptExtend}, ${request.imageCount})`.execute(transaction);
      return inserted.insertId!.toString();
    });
    return this.publish(await this.get(id));
  }

  async waitForResult(id: string, signal?: AbortSignal, onUpdate?: (item: GenerationItem) => void): Promise<GenerationResult> {
    let last = "";
    for (;;) {
      signal?.throwIfAborted();
      // Subscribe before reading so a commit between the read and wait cannot be missed.
      const changed = this.waitForChange(id, signal);
      try {
        let task = await this.get(id);
        if (await this.expire(task)) task = await this.get(id);
        const version = `${task.status}:${task.revision}`;
        let item: GenerationItem | undefined;
        if (version !== last && onUpdate) { item = await this.item(task); onUpdate(item); last = version; }
        if (task.failure_code === "GENERATION_OUTCOME_UNKNOWN") throw new GenerationOutcomeUnknownError(id);
        if (terminal.has(task.status)) return { generationId: id,
          status: task.status === "CANCELLED" ? "FAILED" : task.status as GenerationResult["status"],
          assets: (item ?? await this.item(task)).assets,
          ...(task.failure_code ? { code: task.failure_code, retryable: false } : {}) };
        await changed.promise;
      } finally { changed.close(); }
    }
  }

  private waitForChange(id: string, signal?: AbortSignal) {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    const listeners = this.waiters.get(id) ?? new Set<() => void>();
    this.waiters.set(id, listeners);
    let timer: ReturnType<typeof setTimeout>;
    const close = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", close);
      listeners.delete(close);
      if (!listeners.size && this.waiters.get(id) === listeners) this.waiters.delete(id);
      resolve();
    };
    listeners.add(close);
    signal?.addEventListener("abort", close, { once: true });
    timer = setTimeout(close, 2000);
    if (signal?.aborted) close();
    return { promise, close };
  }

  async execute(id: string, expectedRevision: number): Promise<void> {
    const existing = this.deliveries.get(id);
    if (existing) return existing;
    const delivery = this.run(id, expectedRevision);
    this.deliveries.set(id, delivery);
    try { await delivery; } finally { this.deliveries.delete(id); }
  }

  private async run(id: string, expectedRevision: number): Promise<void> {
    const claimed = await sql`UPDATE executions SET status = 'RUNNING', revision = revision + 1
      WHERE id = ${id} AND kind = 'GENERATION' AND status = 'QUEUED' AND revision = ${expectedRevision}`.execute(this.database.db);
    let task: ImageTask;
    try { task = await this.get(id); }
    catch (error) {
      // An obsolete message for a deleted task is complete; transport/SQL errors still retry.
      if (error instanceof ExecutionConflict && error.code === "NOT_FOUND") return;
      throw error;
    }
    // A redelivery after an infrastructure error can finish the same claimed revision.
    if (claimed.numAffectedRows !== 1n && (task.status !== "RUNNING" || task.revision !== expectedRevision + 1)) return;
    if (task.provider_response_json) { await this.finish(task, parseJson(task.provider_response_json)); return; }
    if (task.provider_started_at) { await this.fail(task, "GENERATION_OUTCOME_UNKNOWN"); return; }
    const local: ActiveCall = { controller: new AbortController(), started: false };
    this.pending.set(id, local);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const parent = (await sql<{ status: string }>`SELECT status FROM executions WHERE id = ${task.parent_id}`.execute(this.database.db)).rows[0];
      if (parent?.status === "CANCELLED") { await this.settlement.cancel(id); await this.publish(await this.get(id)); return; }
      if (await this.expire(task)) return;
      await this.publish(task);
      try { await this.settlement.reserve(id); }
      catch (error) {
        if (!(error instanceof GenerationQuotaError)) throw error;
        await this.fail(task, error.code); return;
      }
      const prepared = await sql`UPDATE executions SET provider_started_at = UTC_TIMESTAMP(3)
        WHERE id = ${id} AND status = 'RUNNING' AND provider_started_at IS NULL`.execute(this.database.db);
      if (prepared.numAffectedRows !== 1n) return;
      const remaining = this.queueTimeoutMs - (Date.now() - task.created_at.getTime());
      timeout = setTimeout(() => local.controller.abort("GENERATION_QUEUE_TIMEOUT"), Math.max(0, remaining));
      let result: BailianProviderResult;
      try {
        result = await this.limiter.run(() => {
          local.controller.signal.throwIfAborted();
          if (Date.now() - task.created_at.getTime() >= this.queueTimeoutMs) {
            local.controller.abort("GENERATION_QUEUE_TIMEOUT");
            local.controller.signal.throwIfAborted();
          }
          local.started = true;
          clearTimeout(timeout);
          return this.provider.generate(task, parseJson(task.request_json).assets);
        }, local.controller.signal);
      } catch (error) {
        if (!local.started) {
          await this.settlement.cancel(id, true,
            local.controller.signal.reason === "GENERATION_QUEUE_TIMEOUT" ? "GENERATION_QUEUE_TIMEOUT" : undefined);
          await this.publish(await this.get(id)); return;
        }
        // Explicit provider rejection is known; transport failures or invalid success responses are ambiguous.
        const knownRejection = error instanceof BailianProviderError &&
          (error.httpStatus >= 400 && error.httpStatus < 500 || error.httpStatus === 200 && !!error.providerCode);
        await this.fail(task, knownRejection ? "GENERATION_FAILED" : "GENERATION_OUTCOME_UNKNOWN");
        return;
      }
      await sql`UPDATE executions SET provider_response_json = ${JSON.stringify(result)}, provider_request_id = ${result.requestId}
        WHERE id = ${id} AND status = 'RUNNING'`.execute(this.database.db);
      await this.finish(task, result);
    } finally {
      if (timeout) clearTimeout(timeout);
      this.pending.delete(id);
    }
  }

  async queued(): Promise<Array<{ id: string; revision: number }>> {
    const expired = (await sql<ImageTask>`SELECT * FROM executions WHERE kind = 'GENERATION' AND status = 'QUEUED'
      AND provider_started_at IS NULL AND created_at <= ${new Date(Date.now() - this.queueTimeoutMs)}`.execute(this.database.db)).rows;
    for (const task of expired) await this.expire(task);
    return (await sql<{ id: string; revision: number }>`SELECT id, revision FROM executions WHERE kind = 'GENERATION'
      AND status = 'QUEUED' AND dispatched_at IS NULL ORDER BY id LIMIT 200`.execute(this.database.db)).rows
      .map((row) => ({ id: String(row.id), revision: row.revision }));
  }

  async markDispatched(id: string, revision: number): Promise<void> {
    await sql`UPDATE executions SET dispatched_at = UTC_TIMESTAMP(3)
      WHERE id = ${id} AND kind = 'GENERATION' AND status = 'QUEUED' AND revision = ${revision}`.execute(this.database.db);
  }

  /** Called once before consumers start; a saved response is always resumed without another paid request. */
  async recover(): Promise<void> {
    const rows = (await sql<ImageTask>`SELECT * FROM executions WHERE kind = 'GENERATION' AND status = 'RUNNING'`.execute(this.database.db)).rows;
    for (const task of rows) {
      if (task.provider_started_at && !task.provider_response_json) await this.fail(task, "GENERATION_OUTCOME_UNKNOWN");
      else await sql`UPDATE executions SET status = 'QUEUED', revision = revision + 1, dispatched_at = NULL
        WHERE id = ${task.id} AND status = 'RUNNING' AND revision = ${task.revision}`.execute(this.database.db);
    }
  }

  async cancelPending(creationId: string): Promise<void> {
    const rows = (await sql<ImageTask>`SELECT * FROM executions WHERE parent_id = ${creationId}
      AND kind = 'GENERATION' AND status IN ('QUEUED', 'RUNNING')`.execute(this.database.db)).rows;
    for (const task of rows) {
      const local = this.pending.get(String(task.id));
      if (local?.started || task.provider_started_at && !local) continue;
      local?.controller.abort("USER_CANCELLED");
      if (await this.settlement.cancel(String(task.id), !!local)) await this.publish(await this.get(String(task.id)));
    }
  }

  async history(sessionId: string): Promise<Array<{ creationId: string; item: GenerationItem }>> {
    const rows = (await sql<ImageTask>`SELECT * FROM executions WHERE session_id = ${sessionId}
      AND kind = 'GENERATION' ORDER BY id`.execute(this.database.db)).rows;
    return Promise.all(rows.map(async (task) => ({ creationId: String(task.parent_id), item: await this.item(task) })));
  }

  private async expire(task: ImageTask): Promise<boolean> {
    const local = this.pending.get(String(task.id));
    if (terminal.has(task.status) || task.provider_response_json || local?.started
        || task.provider_started_at && !local || Date.now() - task.created_at.getTime() < this.queueTimeoutMs) return false;
    local?.controller.abort("GENERATION_QUEUE_TIMEOUT");
    const expired = await this.settlement.cancel(String(task.id), !!local, "GENERATION_QUEUE_TIMEOUT");
    if (expired) await this.publish(await this.get(String(task.id)));
    return expired;
  }

  private async finish(task: ImageTask, result: BailianProviderResult): Promise<void> {
    const completed = await this.transfer.transfer(task, result.imageUrls);
    await this.settlement.settle(String(task.id), completed, result.requestId);
    await this.publish(await this.get(String(task.id)));
  }

  private async fail(task: ImageTask, code: string): Promise<void> {
    await this.settlement.settle(String(task.id), [], null, code);
    await this.publish(await this.get(String(task.id)));
  }

  private async get(id: string): Promise<ImageTask> {
    const task = (await sql<ImageTask>`SELECT * FROM executions WHERE id = ${id} AND kind = 'GENERATION'`.execute(this.database.db)).rows[0];
    if (!task) throw new ExecutionConflict("NOT_FOUND");
    return task;
  }

  private async item(task: ImageTask): Promise<GenerationItem> {
    const assets = (await sql<{ id: string; original_object_key: string }>`SELECT id, original_object_key
      FROM image_assets WHERE origin_task_id = ${task.id} ORDER BY source_index`.execute(this.database.db)).rows;
    return { id: task.tool_call_id, kind: "generation", generationId: String(task.id), status: task.status,
      assets: assets.map((asset) => ({ assetId: String(asset.id), url: this.images.unsigned(asset.original_object_key) })) };
  }

  private async publish(task: ImageTask): Promise<GenerationItem> {
    const item = await this.item(task);
    await this.events.publish([{ userId: String(task.user_id), sessionId: String(task.session_id),
      creationId: String(task.parent_id), type: "creation.item.upserted", item }]).catch(() => {
      this.logger.warn(`Generation ${task.id} event delivery failed; database history remains authoritative`);
    }).finally(() => {
      for (const notify of [...(this.waiters.get(String(task.id)) ?? [])]) notify();
    });
    return item;
  }
}

function parseJson<T>(value: string | T): T { return typeof value === "string" ? JSON.parse(value) as T : value; }
