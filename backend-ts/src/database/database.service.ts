import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDatabaseClient, type PrismaClient } from "./prisma.js";
import type { Environment } from "../config/environment.js";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: PrismaClient;

  constructor(config: ConfigService<Environment, true>) {
    this.db = createDatabaseClient({
      host: config.get("AIVISTA_DB_HOST", { infer: true }) ?? "127.0.0.1",
      port: config.get("AIVISTA_DB_PORT", { infer: true }),
      database: config.get("AIVISTA_DB_NAME", { infer: true }) ?? "aivista",
      user: config.get("AIVISTA_DB_USERNAME", { infer: true }) ?? "",
      password: config.get("AIVISTA_DB_PASSWORD", { infer: true }) ?? "",
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
