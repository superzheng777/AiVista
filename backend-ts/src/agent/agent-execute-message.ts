import { z } from "zod";

export interface AgentExecuteMessage {
  creationId: bigint;
  expectedRevision: number;
}

const schema = z.object({
  creationId: z.string().regex(/^[1-9]\d*$/),
  expectedRevision: z.number().int().nonnegative(),
}).passthrough();

/** 在 JSON parse 前保留 Java BIGINT 的十进制精度。 */
export function parseAgentExecuteMessage(body: Buffer): AgentExecuteMessage {
  const text = body.toString("utf8")
    .replace(/("creationId"\s*:\s*)(\d+)/g, '$1"$2"');
  const value = schema.parse(JSON.parse(text));
  return { creationId: BigInt(value.creationId), expectedRevision: value.expectedRevision };
}
