import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { connect, type Channel, type ChannelModel } from "amqplib";
import type { Environment } from "../config/environment.js";
import { GenerationTaskListenerService } from "./generation-task-listener.service.js";

@Injectable()
export class GenerationTaskConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationTaskConsumerService.name);
  private readonly abort = new AbortController();
  private connection: ChannelModel | undefined;
  private readonly channels: Channel[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private stopped = false;
  constructor(private readonly config: ConfigService<Environment, true>, private readonly listener: GenerationTaskListenerService,
  ) {}

  async onModuleInit() {
    if (!this.config.get("AIVISTA_GENERATION_QUEUE_ENABLED", { infer: true })) return;
    const host = this.config.get("AIVISTA_RABBITMQ_HOST", { infer: true });
    const username = this.config.get("AIVISTA_RABBITMQ_USERNAME", { infer: true });
    const password = this.config.get("AIVISTA_RABBITMQ_PASSWORD", { infer: true });
    if (!host || !username || !password) throw new Error("RabbitMQ configuration is missing");
    await this.connect(host, username, password);
  }

  private async connect(host: string, username: string, password: string): Promise<void> {
    const connection = await connect({ protocol: "amqp", hostname: host,
      port: this.config.get("AIVISTA_RABBITMQ_PORT", { infer: true }), username, password,
      vhost: this.config.get("AIVISTA_RABBITMQ_VHOST", { infer: true }) });
    if (this.stopped) { await connection.close(); return; }
    this.connection = connection;
    connection.on("error", (error) => this.logger.warn(`Generation RabbitMQ connection error: ${error.message}`));
    connection.on("close", () => {
      if (this.connection !== connection) return;
      this.connection = undefined;
      this.channels.length = 0;
      this.scheduleReconnect(host, username, password);
    });
    const generationConcurrency = this.config.get("AIVISTA_GENERATION_CONSUMER_CONCURRENCY", { infer: true });
    for (let index = 0; index < generationConcurrency; index++) await this.startChannel("generation");
    this.reconnectAttempt = 0;
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.abort.abort();
    await Promise.allSettled(this.channels.map((channel) => channel.close()));
    if (this.connection) await this.connection.close();
  }

  private scheduleReconnect(host: string, username: string, password: string): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(15_000, 500 * 2 ** this.reconnectAttempt++);
    this.logger.warn(`Generation RabbitMQ connection closed; reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect(host, username, password).catch((error: Error) => {
        this.logger.warn(`Generation RabbitMQ reconnect failed: ${error.message}`);
        this.scheduleReconnect(host, username, password);
      });
    }, delay);
  }

  private async startChannel(_kind: "generation") {
    const channel = await this.connection!.createChannel(); this.channels.push(channel);
    const exchange = this.config.get("AIVISTA_GENERATION_EXCHANGE", { infer: true });
    const queue = this.config.get("AIVISTA_GENERATION_QUEUE_NAME", { infer: true });
    const routingKey = this.config.get("AIVISTA_GENERATION_ROUTING_KEY", { infer: true });
    await channel.assertExchange(exchange, "direct", { durable: true });
    await channel.assertQueue(queue, { durable: true, arguments: { "x-queue-type": "quorum" } });
    await channel.bindQueue(queue, exchange, routingKey); await channel.prefetch(1);
    await channel.consume(queue, (message) => {
      if (message) void this.listener.consume(message, channel, this.abort.signal)
        .catch((error) => this.logger.error("Generation consumer acknowledgement failed", error));
    }, { noAck: false });
  }
}
