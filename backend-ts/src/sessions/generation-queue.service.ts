import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { z } from "zod";
import type { Environment } from "../config/environment.js";
import { GenerationTaskService } from "./generation-task.service.js";
import { idSchema } from "./session-contract.js";

const commandSchema = z.object({ generationId: idSchema, expectedRevision: z.number().int().nonnegative() }).strict();
const QUEUE = "aivista.generation.execute.v1";

@Injectable()
export class GenerationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationQueueService.name);
  private connection: ChannelModel | undefined;
  private channel: ConfirmChannel | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;
  private stopped = false;
  constructor(private readonly config: ConfigService<Environment, true>, private readonly tasks: GenerationTaskService) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.get("AIVISTA_GENERATION_QUEUE_ENABLED", { infer: true })) return;
    // Recover database state once, before any command can be published or consumed.
    await this.tasks.recover();
    this.timer = setInterval(() => { void this.tick(); }, 2000);
    await this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    const connection = this.connection;
    this.channel = undefined;
    this.connection = undefined;
    await connection?.close();
  }

  private async tick(): Promise<void> {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      if (!this.channel) await this.open();
      for (const row of await this.tasks.queued()) {
        const channel = this.channel;
        if (this.stopped || !channel) return;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Queue publisher confirmation timed out")),
            this.config.get("AIVISTA_RABBITMQ_CONFIRM_TIMEOUT_MS", { infer: true }));
          try {
            channel.sendToQueue(QUEUE,
              Buffer.from(JSON.stringify({ generationId: String(row.id), expectedRevision: row.revision })),
              { persistent: true, contentType: "application/json" }, (error) => {
                clearTimeout(timer); if (error) reject(error); else resolve();
              });
          } catch (error) { clearTimeout(timer); reject(error); }
        });
        await this.tasks.markDispatched(String(row.id), row.revision);
      }
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : "Image queue unavailable");
    } finally { this.ticking = false; }
  }

  private async open(): Promise<void> {
    const connection = await connect({ hostname: this.config.get("AIVISTA_RABBITMQ_HOST", { infer: true }),
      port: this.config.get("AIVISTA_RABBITMQ_PORT", { infer: true }),
      username: this.config.get("AIVISTA_RABBITMQ_USERNAME", { infer: true }),
      password: this.config.get("AIVISTA_RABBITMQ_PASSWORD", { infer: true }),
      vhost: this.config.get("AIVISTA_RABBITMQ_VHOST", { infer: true }) });
    if (this.stopped) { await connection.close(); return; }
    connection.on("error", (error) => this.logger.warn(error.message));
    connection.on("close", () => {
      if (this.connection === connection) { this.connection = undefined; this.channel = undefined; }
    });
    this.connection = connection;
    try {
      const channel = await connection.createConfirmChannel();
      channel.on("error", (error) => this.logger.warn(error.message));
      channel.on("close", () => {
        if (this.channel === channel) {
          this.channel = undefined;
          void connection.close().catch(() => undefined);
        }
      });
      await channel.assertQueue(QUEUE, { durable: true, arguments: { "x-queue-type": "quorum" } });
      await channel.prefetch(this.config.get("AIVISTA_GENERATION_PREFETCH", { infer: true }));
      this.channel = channel;
      await channel.consume(QUEUE, (message) => {
        if (!message) {
          // Broker-side consumer cancellation requires registering a new consumer.
          if (this.channel === channel) this.channel = undefined;
          void connection.close().catch(() => undefined);
          return;
        }
        let command: z.infer<typeof commandSchema>;
        try { command = commandSchema.parse(JSON.parse(message.content.toString("utf8"))); }
        catch { channel.ack(message); return; }
        void this.tasks.execute(command.generationId, command.expectedRevision).then(
          () => { if (this.channel === channel) channel.ack(message); },
          (error: unknown) => {
            this.logger.error(error instanceof Error ? error.stack : "Image execution failed");
            // The task service persists phase/results so transient storage errors are safe to retry.
            setTimeout(() => { if (this.channel === channel) channel.nack(message, false, true); }, 1000).unref();
          },
        ).catch(() => undefined);
      }, { noAck: false });
    } catch (error) {
      if (this.connection === connection) { this.connection = undefined; this.channel = undefined; }
      await connection.close().catch(() => undefined);
      throw error;
    }
  }
}
