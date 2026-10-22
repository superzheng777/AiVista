import { Prisma, queryRows } from "../database/prisma.js";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import type { GenerationExecution } from "../database/database.types.js";
import type { GenerationToolRequest } from "../agent/tools/generation.js";
import { GenerationBailianClientService, type BailianProviderResult } from "../generation/generation-bailian-client.service.js";
import { GenerationImageTransferService } from "../generation/generation-image-transfer.service.js";
import { GenerationImageUrlService } from "../generation/generation-image-url.service.js";
import { GenerationRateLimiterService } from "../generation/generation-rate-limiter.service.js";
import { BailianProviderError } from "../generation/generation-provider-error.js";
import { ExecutionConflict, executionRow, type ExecutionRow } from "./execution-repository.js";
import type { executions } from "../generated/prisma/client.js";
import { GenerationQuotaError, GenerationSettlement } from "./generation-settlement.js";
import { RuntimeEventService } from "./runtime-event-service.js";
import type { AssetReference, CreationStart, ExecutionStatus, GenerationItem, GenerationResult } from "./session-contract.js";

interface ImageTask extends GenerationExecution {
  tool_call_id: string; status: ExecutionStatus; created_at: Date; failure_code: string | null;
  request_json: GenerationToolRequest & { assets: AssetReference[] };
  provider_started_at: Date | null; provider_response_json: BailianProviderResult | null;
}
type ActiveCall = { controller: AbortController; started: boolean };
const terminal = new Set<ExecutionStatus>(["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED"]);

function imageTaskRow(row: executions): ImageTask {
  // GENERATION requests created by this service supply the provider fields.
  return { ...executionRow(row), parent_id: row.parent_id!.toString(), tool_call_id: row.tool_call_id!,
    operation: row.operation!, model: row.model!, final_prompt: row.final_prompt!, width: row.width!, height: row.height!,
    final_negative_prompt: row.final_negative_prompt, prompt_extend: row.prompt_extend,
    requested_image_count: row.requested_image_count!, request_json: row.request_json as ImageTask["request_json"],
    provider_started_at: row.provider_started_at, provider_response_json: row.provider_response_json as BailianProviderResult | null };
}

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
      private readonly events: RuntimeEventService) {
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
    const id = await this.database.db.$transaction(async (transaction) => {
      const current = (await queryRows<ExecutionRow>(transaction, Prisma.sql`SELECT * FROM executions WHERE id = ${parent.id}
        AND kind = 'CREATION' FOR UPDATE`))[0];
      if (!current || current.status !== "RUNNING" || current.revision !== parent.revision) {
        throw new ExecutionConflict("REVISION_CONFLICT");
      }
      const saved = await transaction.executions.findUnique({ where: {
        parent_id_tool_call_id: { parent_id: BigInt(parent.id), tool_call_id: toolCallId },
      } });
      const existing = saved ? imageTaskRow(saved) : null;
      if (existing) {
        // Compare normalized fields; MySQL JSON objects do not preserve property order.
        const previous = existing.request_json;
        if (Object.entries(request).some(([key, value]) => JSON.stringify(previous[key as keyof typeof previous]) !== JSON.stringify(value))) {
          throw new Error("A tool call cannot change its persisted image request");
        }
        return String(existing.id);
      }
      if (start.settings.aspectRatio && request.aspectRatio !== start.settings.aspectRatio) throw new Error("Aspect ratio constraint mismatch");
      const used = await transaction.executions.aggregate({ where: { parent_id: BigInt(parent.id), kind: "GENERATION",
        status: { notIn: ["FAILED", "CANCELLED"] } }, _sum: { requested_image_count: true } });
      if (start.settings.imageCount && (used._sum.requested_image_count ?? 0) + request.imageCount > start.settings.imageCount) {
        throw new Error("Image count exceeds creation limit");
      }
      const inserted = await transaction.executions.create({ data: {
        user_id: BigInt(parent.user_id), session_id: BigInt(parent.session_id), parent_id: BigInt(parent.id),
        kind: "GENERATION", mode: parent.mode, tool_call_id: toolCallId, status: "QUEUED",
        request_json: { ...request, assets }, operation: request.operation,
        model: this.config.get("AIVISTA_GENERATION_MODEL", { infer: true }),
        final_prompt: request.prompt, final_negative_prompt: request.negativePrompt,
        width: dimensions[0]!, height: dimensions[1]!, prompt_extend: request.promptExtend,
        requested_image_count: request.imageCount,
      }, select: { id: true } });
      return inserted.id.toString();
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
        signal?.throwIfAborted();
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
    const claimed = await this.database.db.executions.updateMany({ where: {
      id: BigInt(id), kind: "GENERATION", status: "QUEUED", revision: expectedRevision,
    }, data: { status: "RUNNING", revision: { increment: 1 } } });
    let task: ImageTask;
    try { task = await this.get(id); }
    catch (error) {
      // An obsolete message for a deleted task is complete; transport/SQL errors still retry.
      if (error instanceof ExecutionConflict && error.code === "NOT_FOUND") return;
      throw error;
    }
    // A redelivery after an infrastructure error can finish the same claimed revision.
    if (claimed.count !== 1 && (task.status !== "RUNNING" || task.revision !== expectedRevision + 1)) return;
    if (task.provider_response_json) { await this.finish(task, task.provider_response_json); return; }
    if (task.provider_started_at) { await this.fail(task, "GENERATION_OUTCOME_UNKNOWN"); return; }
    const local: ActiveCall = { controller: new AbortController(), started: false };
    this.pending.set(id, local);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const parent = await this.database.db.executions.findUnique({ where: { id: BigInt(task.parent_id) }, select: { status: true } });
      if (parent?.status === "CANCELLED") { await this.settlement.cancel(id); await this.publish(await this.get(id)); return; }
      if (await this.expire(task)) return;
      await this.publish(task);
      try { await this.settlement.reserve(id); }
      catch (error) {
        if (!(error instanceof GenerationQuotaError)) throw error;
        await this.fail(task, error.code); return;
      }
      const remaining = this.queueTimeoutMs - (Date.now() - task.created_at.getTime());
      timeout = setTimeout(() => local.controller.abort("GENERATION_QUEUE_TIMEOUT"), Math.max(0, remaining));
      let result: BailianProviderResult;
      try {
        result = await this.limiter.run(async () => {
          local.controller.signal.throwIfAborted();
          if (Date.now() - task.created_at.getTime() >= this.queueTimeoutMs) {
            local.controller.abort("GENERATION_QUEUE_TIMEOUT");
            local.controller.signal.throwIfAborted();
          }
          if (!await this.settlement.startProviderCall(id)) throw new Error("Generation dispatch was cancelled");
          local.controller.signal.throwIfAborted();
          local.started = true;
          clearTimeout(timeout);
          return this.provider.generate(task, task.request_json.assets);
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
      await this.database.db.executions.updateMany({ where: { id: BigInt(id), status: "RUNNING" },
        data: { provider_response_json: { requestId: result.requestId, imageUrls: result.imageUrls }, provider_request_id: result.requestId } });
      await this.finish(task, result);
    } finally {
      if (timeout) clearTimeout(timeout);
      this.pending.delete(id);
    }
  }

  async queued(): Promise<Array<{ id: string; revision: number }>> {
    const expired = (await this.database.db.executions.findMany({ where: { kind: "GENERATION", status: "QUEUED",
      provider_started_at: null, created_at: { lte: new Date(Date.now() - this.queueTimeoutMs) } } })).map(imageTaskRow);
    for (const task of expired) await this.expire(task);
    return (await this.database.db.executions.findMany({ where: { kind: "GENERATION", status: "QUEUED", dispatched_at: null },
      select: { id: true, revision: true }, orderBy: { id: "asc" }, take: 200 }))
      .map((row) => ({ id: String(row.id), revision: row.revision }));
  }

  async markDispatched(id: string, revision: number): Promise<void> {
    await this.database.db.executions.updateMany({ where: { id: BigInt(id), kind: "GENERATION", status: "QUEUED", revision },
      data: { dispatched_at: new Date() } });
  }

  /** Called once before consumers start; a saved response is always resumed without another paid request. */
  async recover(): Promise<void> {
    const rows = (await this.database.db.executions.findMany({ where: { kind: "GENERATION", status: "RUNNING" } })).map(imageTaskRow);
    for (const task of rows) {
      if (task.provider_started_at && !task.provider_response_json) await this.fail(task, "GENERATION_OUTCOME_UNKNOWN");
      else await this.database.db.executions.updateMany({ where: { id: BigInt(task.id), status: "RUNNING", revision: task.revision },
        data: { status: "QUEUED", revision: { increment: 1 }, dispatched_at: null } });
    }
  }

  async cancelPending(creationId: string): Promise<void> {
    const rows = (await this.database.db.executions.findMany({ where: { parent_id: BigInt(creationId), kind: "GENERATION",
      status: { in: ["QUEUED", "RUNNING"] } } })).map(imageTaskRow);
    for (const task of rows) {
      const local = this.pending.get(String(task.id));
      if (local?.started || task.provider_started_at && !local) continue;
      local?.controller.abort("USER_CANCELLED");
      if (await this.settlement.cancel(String(task.id), !!local)) await this.publish(await this.get(String(task.id)));
    }
  }

  async history(sessionId: string): Promise<Array<{ creationId: string; item: GenerationItem }>> {
    const rows = (await this.database.db.executions.findMany({ where: { session_id: BigInt(sessionId), kind: "GENERATION" },
      orderBy: { id: "asc" } })).map(imageTaskRow);
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
    const parent = await this.database.db.executions.findUnique({ where: { id: BigInt(task.parent_id) }, select: { status: true } });
    let completed: Awaited<ReturnType<GenerationImageTransferService["transfer"]>> = [];
    if (parent?.status !== "CANCELLED") {
      completed = await this.transfer.transfer(task, result.imageUrls);
    }
    const settled = await this.settlement.settle(String(task.id), completed, result.requestId);
    if (settled.status === "CANCELLED") {
      // Best effort only: cleanup must not undo settlement or retry the paid request.
      for (let index = 0; index < result.imageUrls.length; index++) {
        await this.transfer.deleteGroup(this.transfer.objectKey(task, index)).catch(() => {
          this.logger.warn(`Cancelled generation ${task.id} source ${index} may have orphaned OSS objects`);
        });
      }
    }
    await this.publish(await this.get(String(task.id)));
  }

  private async fail(task: ImageTask, code: string): Promise<void> {
    await this.settlement.settle(String(task.id), [], null, code);
    await this.publish(await this.get(String(task.id)));
  }

  private async get(id: string): Promise<ImageTask> {
    const task = await this.database.db.executions.findFirst({ where: { id: BigInt(id), kind: "GENERATION" } });
    if (!task) throw new ExecutionConflict("NOT_FOUND");
    return imageTaskRow(task);
  }

  private async item(task: ImageTask): Promise<GenerationItem> {
    const assets = await this.database.db.image_assets.findMany({ where: { origin_task_id: BigInt(task.id) },
      select: { id: true, original_object_key: true }, orderBy: { source_index: "asc" } });
    const parent = await this.database.db.executions.findUnique({ where: { id: BigInt(task.parent_id) }, select: { status: true } });
    const status = parent?.status === "CANCELLED" && !terminal.has(task.status) ? "CANCELLED" : task.status;
    return { id: task.tool_call_id, kind: "generation", generationId: String(task.id), status,
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
