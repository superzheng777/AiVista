import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, Prisma } from "../generated/prisma/client.js";

export { PrismaClient, Prisma };
export type TransactionClient = Prisma.TransactionClient;

export function createDatabaseClient(connection: {
  host: string; port: number; database: string; user: string; password: string;
}, sessionSql: string[] = []): PrismaClient {
  const adapter = new PrismaMariaDb({
    ...connection,
    connectionLimit: 10,
    timezone: "Z",
    initSql: ["SET time_zone = '+00:00'", ...sessionSql],
  });
  return new PrismaClient({ adapter, transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
}

/** Keep the existing string-ID contract at raw SQL boundaries, including unsigned BIGINTs. */
export async function queryRows<T>(db: Pick<TransactionClient, "$queryRaw">, query: Prisma.Sql): Promise<T[]> {
  const rows = await db.$queryRaw<Array<Record<string, unknown>>>(query);
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, typeof value === "bigint" ? normalizeInteger(key, value) : value]))) as T[];
}

function normalizeInteger(column: string, value: bigint): string | number {
  // The adapter also returns MySQL UNSIGNED INTs (revision, dimensions) as bigint.
  // Preserve only BIGINT identity/storage columns as strings; never lose large-integer precision.
  if (column === "id" || column.endsWith("_id") || column === "file_size"
      || value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) return value.toString();
  return Number(value);
}
