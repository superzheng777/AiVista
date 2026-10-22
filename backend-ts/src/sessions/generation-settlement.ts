import { Prisma, queryRows, type PrismaClient } from "../database/prisma.js";
import type { TransferredImage } from "../generation/generation-image-transfer.service.js";
import type { AssetReference, ExecutionStatus } from "./session-contract.js";

interface GenerationRow {
  id: string; user_id: string; parent_id: string; status: ExecutionStatus; revision: number;
  requested_image_count: number; width: number; height: number; created_at: Date;
  quota_reserved_at: Date | null; settled_at: Date | null; provider_started_at: Date | null;
}
export class GenerationQuotaError extends Error {
  constructor(readonly code: "DAILY_GENERATION_QUOTA_EXCEEDED" | "USER_GENERATION_CONCURRENCY_LIMIT") { super(code); }
}

/** Quota, delivered assets, and the generation terminal state share one SQL transaction. */
export class GenerationSettlement {
  constructor(private readonly db: PrismaClient, private readonly limits: { daily: number; concurrent: number },
      private readonly unsigned: (key: string) => string) {}

  /** Only the caller that has prevented a local pending call may cancel its intent marker. */
  async cancel(generationId: string, allowPreparedCall = false, failureCode?: string): Promise<boolean> {
    return this.db.$transaction(async (transaction) => {
      const task = (await queryRows<GenerationRow & { provider_started_at: Date | null }>(transaction, Prisma.sql`SELECT * FROM executions
        WHERE id = ${generationId} AND kind = 'GENERATION' FOR UPDATE`))[0];
      if (!task || task.settled_at || !["QUEUED", "RUNNING"].includes(task.status)
          || task.provider_started_at && !allowPreparedCall) return false;
      if (task.quota_reserved_at) {
        const refund = await transaction.user_generation_daily_usage.updateMany({ where: {
          user_id: BigInt(task.user_id), usage_date: usageDate(task.created_at), requested_image_count: { gte: task.requested_image_count },
        }, data: { requested_image_count: { decrement: task.requested_image_count } } });
        if (refund.count !== 1) throw new Error("Generation quota reservation is missing");
      }
      await transaction.executions.update({ where: { id: BigInt(generationId) }, data: {
        status: failureCode ? "FAILED" : "CANCELLED", revision: { increment: 1 }, failure_code: failureCode ?? "USER_CANCELLED",
        completed_at: new Date(), settled_at: new Date(), quota_refunded_at: task.quota_reserved_at ? new Date() : null,
      } });
      return true;
    });
  }

  async reserve(generationId: string): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      const task = (await queryRows<GenerationRow>(transaction, Prisma.sql`SELECT * FROM executions WHERE id = ${generationId}
        AND kind = 'GENERATION' FOR UPDATE`))[0];
      if (!task || task.status !== "RUNNING") throw new Error("Generation is not running");
      if (task.quota_reserved_at || task.settled_at) return;
      await queryRows<Record<string, unknown>>(transaction, Prisma.sql`SELECT id FROM users WHERE id = ${task.user_id} FOR UPDATE`);
      const active = await transaction.executions.count({ where: { user_id: BigInt(task.user_id), kind: "GENERATION",
        quota_reserved_at: { not: null }, settled_at: null } });
      if (active >= this.limits.concurrent) throw new GenerationQuotaError("USER_GENERATION_CONCURRENCY_LIMIT");
      const date = usageDate(task.created_at);
      await transaction.user_generation_daily_usage.createMany({ data: [{ user_id: BigInt(task.user_id), usage_date: date,
        requested_image_count: 0 }], skipDuplicates: true });
      const reserved = await transaction.user_generation_daily_usage.updateMany({ where: {
        user_id: BigInt(task.user_id), usage_date: date, requested_image_count: { lte: this.limits.daily - task.requested_image_count },
      }, data: { requested_image_count: { increment: task.requested_image_count } } });
      if (reserved.count !== 1) throw new GenerationQuotaError("DAILY_GENERATION_QUOTA_EXCEEDED");
      await transaction.executions.update({ where: { id: BigInt(generationId) }, data: { quota_reserved_at: new Date() } });
    });
  }

  /** Serializes the dispatch boundary with parent cancellation, after rate permission. */
  async startProviderCall(generationId: string): Promise<boolean> {
    return this.db.$transaction(async (transaction) => {
      const identity = await transaction.executions.findUnique({ where: { id: BigInt(generationId) }, select: { parent_id: true } });
      if (!identity?.parent_id) return false;
      const parent = (await queryRows<{ status: string }>(transaction, Prisma.sql`SELECT status FROM executions
        WHERE id = ${identity.parent_id} FOR UPDATE`))[0];
      if (parent?.status !== "RUNNING") return false;
      const result = await transaction.executions.updateMany({ where: { id: BigInt(generationId), kind: "GENERATION", status: "RUNNING",
        quota_reserved_at: { not: null }, provider_started_at: null }, data: { provider_started_at: new Date() } });
      return result.count === 1;
    });
  }

  async settle(generationId: string, completed: TransferredImage[], providerRequestId: string | null = null,
      failureCode = "GENERATION_FAILED"): Promise<{ status: "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" | "CANCELLED"; assets: AssetReference[] }> {
    return this.db.$transaction(async (transaction) => {
      const identity = await transaction.executions.findUnique({ where: { id: BigInt(generationId) }, select: { parent_id: true } });
      if (!identity?.parent_id) throw new Error("Generation is missing");
      // Cancellation takes this same parent lock. Whichever commits first owns the delivery decision.
      const parent = (await queryRows<{ status: string }>(transaction, Prisma.sql`SELECT status FROM executions
        WHERE id = ${identity.parent_id} FOR UPDATE`))[0];
      const task = (await queryRows<GenerationRow>(transaction, Prisma.sql`SELECT * FROM executions WHERE id = ${generationId}
        AND kind = 'GENERATION' FOR UPDATE`))[0];
      if (!task) throw new Error("Generation is missing");
      let status = task.status;
      if (!task.settled_at) {
        const cancelled = parent?.status === "CANCELLED";
        if (cancelled) completed = [];
        if (task.status !== "RUNNING" || completed.length > task.requested_image_count
            || completed.length > 0 && !task.quota_reserved_at) throw new Error("Invalid generation settlement");
        const indexes = new Set<number>();
        for (const image of completed) {
          if (indexes.has(image.sourceIndex) || image.sourceIndex < 0 || image.sourceIndex >= task.requested_image_count
              || image.width !== task.width || image.height !== task.height || image.fileSize <= 0n
              || !image.objectKey.endsWith(`/${task.user_id}/tasks/${generationId}/${image.sourceIndex}`)) {
            throw new Error("Invalid transferred image");
          }
          indexes.add(image.sourceIndex);
          await transaction.image_assets.create({ data: { user_id: BigInt(task.user_id), origin: "GENERATED", lifecycle: "PERSISTENT",
            origin_task_id: BigInt(generationId), source_index: image.sourceIndex, object_key: image.objectKey,
            original_object_key: `${image.objectKey}/original.png`, content_type: "image/png", file_size: image.fileSize,
            width: image.width, height: image.height } });
        }
        // Once dispatch has started, cancellation and discarded output do not reverse consumption.
        const refund = task.provider_started_at ? 0 : task.requested_image_count - completed.length;
        if (refund && task.quota_reserved_at) {
          const refunded = await transaction.user_generation_daily_usage.updateMany({ where: { user_id: BigInt(task.user_id),
            usage_date: usageDate(task.created_at), requested_image_count: { gte: refund } },
            data: { requested_image_count: { decrement: refund } } });
          if (refunded.count !== 1) throw new Error("Generation quota reservation is missing");
        }
        status = cancelled ? "CANCELLED" : completed.length === task.requested_image_count ? "SUCCEEDED" : completed.length ? "PARTIALLY_SUCCEEDED" : "FAILED";
        await transaction.executions.update({ where: { id: BigInt(generationId) }, data: { status, revision: { increment: 1 },
          completed_image_count: completed.length, settled_at: new Date(), completed_at: new Date(),
          quota_refunded_at: refund && task.quota_reserved_at ? new Date() : null, provider_request_id: providerRequestId,
          failure_code: cancelled ? "USER_CANCELLED" : completed.length ? null : failureCode } });
      }
      const assets = (await queryRows<{ id: string; original_object_key: string }>(transaction, Prisma.sql`SELECT id, original_object_key
        FROM image_assets WHERE origin_task_id = ${generationId} ORDER BY source_index FOR SHARE`))
        .map((asset) => ({ assetId: String(asset.id), url: this.unsigned(asset.original_object_key) }));
      return { status: status as "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" | "CANCELLED", assets };
    });
  }
}

function usageDate(createdAt: Date): Date {
  return new Date(`${new Date(createdAt.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00.000Z`);
}
