import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import type { Environment } from "../config/environment.js";
import { CreationRuntimeService } from "./creation-runtime.service.js";
import { ExecutionConflict } from "./execution-repository.js";
import { idSchema } from "./session-contract.js";

@Injectable()
export class CreationHttpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CreationHttpService.name);
  private server: Server | undefined;
  constructor(private readonly config: ConfigService<Environment, true>, private readonly runtime: CreationRuntimeService) {}

  async onModuleInit(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error: unknown) => {
        const status = error instanceof ExecutionConflict ? error.code === "NOT_FOUND" ? 404 : 409
          : error instanceof ZodError || error instanceof SyntaxError ? 400 : 500;
        if (status === 500) this.logger.error(error instanceof Error ? error.stack : "Runtime request failed");
        this.send(response, status, { code: error instanceof ExecutionConflict ? error.code : "RUNTIME_REQUEST_FAILED" });
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.config.get("AIVISTA_RUNTIME_PORT", { infer: true }),
        this.config.get("AIVISTA_RUNTIME_HOST", { infer: true }), resolve);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await new Promise<void>((resolve) => this.server ? this.server.close(() => resolve()) : resolve());
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const expected = Buffer.from(this.config.get("AIVISTA_GENERATION_WORKER_TOKEN", { infer: true }) ?? "");
    const supplied = Buffer.from(String(request.headers["x-aivista-worker-token"] ?? ""));
    if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      this.send(response, 401, { code: "UNAUTHORIZED" }); return;
    }
    const userId = idSchema.parse(request.headers["x-aivista-user-id"]);
    const path = new URL(request.url ?? "/", "http://runtime").pathname;
    const method = request.method;
    if (path === "/internal/generation-sessions" && method === "GET") {
      this.send(response, 200, await this.runtime.list(userId)); return;
    }
    const session = /^\/internal\/generation-sessions\/([1-9]\d*)$/.exec(path);
    if (session && method === "GET") {
      this.send(response, 200, await this.runtime.history(userId, session[1]!)); return;
    }
    if (session && method === "PATCH") {
      this.send(response, 200, await this.runtime.title(userId, session[1]!, await readBody(request))); return;
    }
    if (session && method === "DELETE") {
      this.send(response, 200, await this.runtime.deleteSession(userId, session[1]!)); return;
    }
    if (path === "/internal/creations" && method === "POST") {
      this.send(response, 202, await this.runtime.create(userId, await readBody(request))); return;
    }
    const creation = /^\/internal\/creations\/([1-9]\d*)$/.exec(path);
    if (creation && method === "GET") {
      this.send(response, 200, await this.runtime.turn(userId, creation[1]!)); return;
    }
    const cancellation = /^\/internal\/creations\/([1-9]\d*)\/cancellation$/.exec(path);
    if (cancellation && method === "PUT") {
      this.send(response, 200, await this.runtime.cancel(userId, cancellation[1]!)); return;
    }
    const form = /^\/internal\/creations\/([1-9]\d*)\/forms\/([^/]+)\/response$/.exec(path);
    if (form && method === "PUT") {
      const result = await this.runtime.answer(userId, form[1]!, decodeURIComponent(form[2]!), await readBody(request));
      this.send(response, result.changed ? 201 : 200, result); return;
    }
    this.send(response, 404, { code: "NOT_FOUND" });
  }

  private send(response: ServerResponse, status: number, data: unknown): void {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(data));
  }
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1_048_576) throw new SyntaxError("Request body exceeds limit");
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
