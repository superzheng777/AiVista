import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "../database/database.types.js";
import type { TransferredImage } from "../generation/generation-image-transfer.service.js";
import type { AssetReference, ExecutionStatus } from "./session-contract.js";

interface GenerationRow {
  id: string; user_id: string; status: ExecutionStatus; revision: number;
  requested_image_count: number; width: number; height: number; created_at: Date;
  quota_reserved_at: Date | null; settled_at: Date | null;
}
export class GenerationQuotaError extends Error {
  constructor(readonly code: "DAILY_GENERATION_QUOTA_EXCEEDED" | "USER_GENERATION_CONCURRENCY_LIMIT") { super(code); }
}

/** Quota, delivered assets, and the generation terminal state share one SQL transaction. */
export class GenerationSettlement {
  constructor(private readonly db: Kysely<DatabaseSchema>, private readonly limits: { daily: number; concurrent: number },
      private readonly unsigned: (key: string) => string) {}

  async reserve(generationId: string): Promise<void> {
    await this.db.transaction().execute(async (transaction) => {
      const task = (await sql<GenerationRow>`SELECT * FROM executions WHERE id = ${generationId}
        AND kind = 'GENERATION' FOR UPDATE`.execute(transaction)).rows[0];
      if (!task || task.status !== "RUNNING") throw new Error("Generation is not running");
      if (task.quota_reserved_at || task.settled_at) return;
      await sql`SELECT id FROM users WHERE id = ${task.user_id} FOR UPDATE`.execute(transaction);
      const active = (await sql<{ count: string }>`SELECT COUNT(*) AS count FROM executions
        WHERE user_id = ${task.user_id} AND kind = 'GENERATION'
        AND quota_reserved_at IS NOT NULL AND settled_at IS NULL`.execute(transaction)).rows[0]!;
      if (Number(active.count) >= this.limits.concurrent) throw new GenerationQuotaError("USER_GENERATION_CONCURRENCY_LIMIT");
      const date = usageDate(task.created_at);
      await sql`INSERT IGNORE INTO user_generation_daily_usage (user_id, usage_date, requested_image_count)
        VALUES (${task.user_id}, ${date}, 0)`.execute(transaction);
      const reserved = await sql`UPDATE user_generation_daily_usage
        SET requested_image_count = requested_image_count + ${task.requested_image_count}
        WHERE user_id = ${task.user_id} AND usage_date = ${date}
          AND requested_image_count + ${task.requested_image_count} <= ${this.limits.daily}`.execute(transaction);
      if (reserved.numAffectedRows !== 1n) throw new GenerationQuotaError("DAILY_GENERATION_QUOTA_EXCEEDED");
      await sql`UPDATE executions SET quota_reserved_at = UTC_TIMESTAMP(3) WHERE id = ${generationId}`.execute(transaction);
    });
  }

  async settle(generationId: string, completed: TransferredImage[], providerRequestId: string | null = null,
      failureCode = "GENERATION_FAILED"): Promise<{ status: "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED"; assets: AssetReference[] }> {
    return this.db.transaction().execute(async (transaction) => {
      const task = (await sql<GenerationRow>`SELECT * FROM executions WHERE id = ${generationId}
        AND kind = 'GENERATION' FOR UPDATE`.execute(transaction)).rows[0];
      if (!task) throw new Error("Generation is missing");
      if (!task.settled_at) {
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
          await sql`INSERT INTO image_assets (user_id, origin, lifecycle, origin_task_id, source_index,
            object_key, original_object_key, content_type, file_size, width, height)
            VALUES (${task.user_id}, 'GENERATED', 'PERSISTENT', ${generationId}, ${image.sourceIndex},
              ${image.objectKey}, ${image.objectKey + "/original.png"}, 'image/png', ${image.fileSize.toString()},
              ${image.width}, ${image.height})`.execute(transaction);
        }
        const refund = task.requested_image_count - completed.length;
        if (refund && task.quota_reserved_at) {
          const refunded = await sql`UPDATE user_generation_daily_usage
            SET requested_image_count = requested_image_count - ${refund}
            WHERE user_id = ${task.user_id} AND usage_date = ${usageDate(task.created_at)}
              AND requested_image_count >= ${refund}`.execute(transaction);
          if (refunded.numAffectedRows !== 1n) throw new Error("Generation quota reservation is missing");
        }
        const status = completed.length === task.requested_image_count ? "SUCCEEDED" : completed.length ? "PARTIALLY_SUCCEEDED" : "FAILED";
        await sql`UPDATE executions SET status = ${status}, revision = revision + 1,
          completed_image_count = ${completed.length}, settled_at = UTC_TIMESTAMP(3), completed_at = UTC_TIMESTAMP(3),
          quota_refunded_at = ${refund && task.quota_reserved_at ? new Date() : null},
          provider_request_id = ${providerRequestId}, failure_code = ${completed.length ? null : failureCode}
          WHERE id = ${generationId}`.execute(transaction);
      }
      const assets = (await sql<{ id: string; original_object_key: string }>`SELECT id, original_object_key
        FROM image_assets WHERE origin_task_id = ${generationId} ORDER BY source_index`.execute(transaction)).rows
        .map((asset) => ({ assetId: String(asset.id), url: this.unsigned(asset.original_object_key) }));
      return { status: assets.length === task.requested_image_count ? "SUCCEEDED" : assets.length ? "PARTIALLY_SUCCEEDED" : "FAILED", assets };
    });
  }
}

function usageDate(createdAt: Date): string {
  return new Date(createdAt.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
