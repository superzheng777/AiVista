import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import type { Environment } from "../config/environment.js";
import { idSchema, type CreationItem, type CreationTurn, type ExecutionStatus } from "./session-contract.js";

export interface RuntimeEvent {
  userId: string; sessionId: string; creationId: string;
  type: "creation.updated" | "creation.item.upserted" | "creation.text.delta";
  status?: ExecutionStatus; revision?: number; item?: CreationItem;
  itemId?: string; assistantMessageId?: string; delta?: string; offset?: number;
}
type Cursor = { streamId: string; sequence: number };
const MAX_BUFFER = 1_048_576;

/** User-scoped transport. Pi owns history; only cursors and connected subscribers live here. */
@Injectable()
export class RuntimeEventService implements OnModuleDestroy {
  private readonly sockets = new Map<string, WebSocket>();
  private readonly cursors = new Map<string, Cursor>();
  private readonly cleanup = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly server = new WebSocketServer({ noServer: true, maxPayload: 65_536, perMessageDeflate: false });
  private readonly heartbeat: ReturnType<typeof setInterval>;
  resolveTurn!: (userId: string, creationId: string) => Promise<CreationTurn & {
    sessionId: string; stream: { id: string; sequence: number };
  }>;
  activeIds!: (userId: string) => Promise<string[]>;

  constructor(private readonly config: ConfigService<Environment, true>) {
    this.heartbeat = setInterval(() => {
      for (const socket of this.sockets.values()) {
        if ((socket as WebSocket & { alive?: boolean }).alive === false) socket.terminate();
        else { (socket as WebSocket & { alive?: boolean }).alive = false; socket.ping(); }
      }
    }, 15_000);
    this.heartbeat.unref();
  }

  attach(http: Server): void {
    http.on("upgrade", (request, socket, head) => {
      const expected = Buffer.from(this.config.get("AIVISTA_GENERATION_WORKER_TOKEN", { infer: true }) ?? "");
      const supplied = Buffer.from(String(request.headers["x-aivista-worker-token"] ?? ""));
      const user = idSchema.safeParse(request.headers["x-aivista-user-id"]);
      if (request.url !== "/internal/events" || !user.success || !expected.length
          || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); return;
      }
      this.server.handleUpgrade(request, socket, head, (client) => {
        this.sockets.get(user.data)?.close(1000, "Replaced");
        this.sockets.set(user.data, client);
        client.on("pong", () => { (client as WebSocket & { alive?: boolean }).alive = true; });
        client.on("error", () => client.terminate());
        client.on("close", () => { if (this.sockets.get(user.data) === client) this.sockets.delete(user.data); });
        client.on("message", (data) => {
          void this.sync(user.data, client, data.toString()).catch(() => client.close(1008, "Invalid subscription"));
        });
        this.send(client, { type: "runtime.ready" });
      });
    });
  }

  async publish(events: RuntimeEvent[]): Promise<void> {
    for (const event of events) {
      const cursor = this.cursor(event.creationId);
      cursor.sequence += 1;
      const socket = this.sockets.get(event.userId);
      if (socket) this.send(socket, { ...event, ...cursor });
      if ((event.type === "creation.updated" && event.status && this.terminal(event.status))
          || (event.item?.kind === "generation" && this.terminal(event.item.status))) this.releaseLater(event.creationId);
    }
  }

  private cursor(id: string): Cursor {
    let value = this.cursors.get(id);
    if (!value) { value = { streamId: randomUUID(), sequence: 0 }; this.cursors.set(id, value); }
    return value;
  }

  /** Both HTTP and WS use the same event boundary around asynchronous history reads. */
  async snapshot(ids: string[], read: () => Promise<CreationTurn[]>): Promise<Array<CreationTurn & {
    stream: { id: string; sequence: number };
  }>> {
    const known = new Set(ids);
    for (;;) {
      const before = new Map([...known].map((id) => [id, { ...this.cursor(id) }]));
      const turns = await read();
      if (turns.some((turn) => {
        known.add(turn.creationId);
        const prior = before.get(turn.creationId);
        const current = this.cursor(turn.creationId);
        return !prior || prior.streamId !== current.streamId || prior.sequence !== current.sequence;
      })) continue;
      return turns.map((turn) => {
        const cursor = before.get(turn.creationId)!;
        if (this.terminal(turn.status)) this.releaseLater(turn.creationId);
        return { ...turn, stream: { id: cursor.streamId, sequence: cursor.sequence } };
      });
    }
  }

  private terminal(status: string): boolean {
    return ["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED"].includes(status);
  }

  private releaseLater(id: string): void {
    clearTimeout(this.cleanup.get(id));
    const timer = setTimeout(() => { this.cursors.delete(id); this.cleanup.delete(id); }, 60_000);
    timer.unref(); this.cleanup.set(id, timer);
  }

  private async sync(userId: string, socket: WebSocket, raw: string): Promise<void> {
    const request = JSON.parse(raw) as { type: string; creationIds?: string[] };
    if (request.type !== "sync" || !Array.isArray(request.creationIds) || request.creationIds.length > 30) {
      throw new Error("Invalid sync request");
    }
    const ids = new Set([...request.creationIds.map((id) => idSchema.parse(id)), ...await this.activeIds(userId)]);
    for (const id of ids) {
      if (socket.readyState !== WebSocket.OPEN) break;
      const turn = await this.resolveTurn(userId, id);
      this.send(socket, { type: "creation.snapshot", userId, sessionId: turn.sessionId,
        creationId: id, streamId: turn.stream.id, sequence: turn.stream.sequence, turn });
    }
  }

  private send(socket: WebSocket, event: unknown): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    const payload = JSON.stringify(event);
    if (socket.bufferedAmount + Buffer.byteLength(payload) > MAX_BUFFER) { socket.close(1013, "Slow consumer"); return; }
    socket.send(payload);
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeat);
    for (const timer of this.cleanup.values()) clearTimeout(timer);
    for (const socket of this.sockets.values()) socket.terminate();
    this.server.close();
  }
}
