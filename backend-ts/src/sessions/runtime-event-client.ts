import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";
import type { CreationItem, ExecutionStatus } from "./session-contract.js";

export interface RuntimeEvent {
  userId: string; sessionId: string; creationId: string;
  type: "creation.updated" | "creation.item.upserted";
  status?: ExecutionStatus; revision?: number; item?: CreationItem;
}

@Injectable()
export class RuntimeEventClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  constructor(config: ConfigService<Environment, true>) {
    this.baseUrl = config.get("AIVISTA_JAVA_BASE_URL", { infer: true }).replace(/\/$/, "");
    this.token = config.get("AIVISTA_GENERATION_WORKER_TOKEN", { infer: true }) ?? "";
    this.timeoutMs = config.get("AIVISTA_JAVA_REQUEST_TIMEOUT_MS", { infer: true });
  }

  async publish(events: RuntimeEvent[]): Promise<void> {
    await this.post("/internal/creation-runtime/events", { events });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { method: "POST",
      headers: { "Content-Type": "application/json", "X-AiVista-Worker-Token": this.token },
      body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) throw new Error(`Java event delivery failed: HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }

}
