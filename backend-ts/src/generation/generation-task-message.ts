import { z } from "zod";
export interface TaskExecuteMessage { generationTaskId: bigint; expectedRevision: number }

const schema = z.object({ generationTaskId: z.string().regex(/^\d+$/),
  expectedRevision: z.number().int().nonnegative() }).passthrough();

/** JSON 数字形式的 BIGINT 在解析前转为字符串，避免 JS Number 精度丢失。 */
export function parseTaskExecuteMessage(body: Buffer): TaskExecuteMessage {
  const text = body.toString("utf8").replace(/("generationTaskId"\s*:\s*)(\d+)/g, '$1"$2"');
  const value = schema.parse(JSON.parse(text));
  return { generationTaskId: BigInt(value.generationTaskId), expectedRevision: value.expectedRevision };
}
