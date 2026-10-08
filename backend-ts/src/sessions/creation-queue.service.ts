import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { sql } from "kysely";
import { z } from "zod";
import type { Environment } from "../config/environment.js";
import { DatabaseService } from "../database/database.service.js";
import { CreationRuntimeService } from "./creation-runtime.service.js";
import { idSchema } from "./session-contract.js";

const commandSchema = z.object({ executionId: idSchema, expectedRevision: z.number().int().nonnegative() }).strict();
const QUEUE = "aivista.creation.execute.v1";

@Injectable()
export class CreationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CreationQueueService.name);
  private connection: ChannelModel | undefined;
  private channel: ConfirmChannel | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;
  private stopped = false;
  constructor(private readonly config: ConfigService<Environment, true>, private readonly runtime: CreationRuntimeService,
      private readonly database: DatabaseService) {}

  onModuleInit(): void {
    if (!this.config.get("AIVISTA_GENERATION_QUEUE_ENABLED", { infer: true })) return;
    this.timer = setInterval(() => { void this.tick(); }, 2000);
    void this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.connection?.close();
  }

  private async tick(): Promise<void> {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      if (!this.channel) await this.open();
      for (const row of await this.runtime.executions.queued()) {
        const channel = this.channel!;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Queue publisher confirmation timed out")),
            this.config.get("AIVISTA_RABBITMQ_CONFIRM_TIMEOUT_MS", { infer: true }));
          channel.sendToQueue(QUEUE,
            Buffer.from(JSON.stringify({ executionId: String(row.id), expectedRevision: row.revision })),
            { persistent: true, contentType: "application/json" }, (error) => {
              clearTimeout(timer); if (error) reject(error); else resolve();
            });
        });
        await sql`UPDATE executions SET dispatched_at = UTC_TIMESTAMP(3)
          WHERE id = ${row.id} AND revision = ${row.revision} AND status = 'QUEUED'`.execute(this.database.db);
      }
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : "Creation queue unavailable");
    } finally { this.ticking = false; }
  }

  private async open(): Promise<void> {
    const connection = await connect({ hostname: this.config.get("AIVISTA_RABBITMQ_HOST", { infer: true }),
      port: this.config.get("AIVISTA_RABBITMQ_PORT", { infer: true }),
      username: this.config.get("AIVISTA_RABBITMQ_USERNAME", { infer: true }),
      password: this.config.get("AIVISTA_RABBITMQ_PASSWORD", { infer: true }),
      vhost: this.config.get("AIVISTA_RABBITMQ_VHOST", { infer: true }) });
    connection.on("error", (error) => this.logger.warn(error.message));
    connection.on("close", () => { if (this.connection === connection) { this.connection = undefined; this.channel = undefined; } });
    this.connection = connection;
    const channel = await connection.createConfirmChannel();
    await channel.assertQueue(QUEUE, { durable: true, arguments: { "x-queue-type": "quorum" } });
    await channel.prefetch(this.config.get("AIVISTA_AGENT_MAX_CONCURRENT", { infer: true }));
    await channel.consume(QUEUE, (message) => {
      if (!message) return;
      let command: z.infer<typeof commandSchema>;
      try { command = commandSchema.parse(JSON.parse(message.content.toString("utf8"))); }
      catch { channel.ack(message); return; }
      void this.runtime.execute(command.executionId, command.expectedRevision).then(
        () => channel.ack(message),
        (error: unknown) => {
          this.logger.error(error instanceof Error ? error.stack : "Creation execution failed");
          // Failed database access must not acknowledge an unclaimed command as a duplicate.
          setTimeout(() => { if (this.channel === channel) channel.nack(message, false, true); }, 1000);
        },
      ).catch(() => undefined);
    });
    this.channel = channel;
  }
}
