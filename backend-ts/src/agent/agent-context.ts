import {
  SessionManager,
  type CompactionEntry,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { z } from "zod";

type AgentMessage = Parameters<SessionManager["appendMessage"]>[0];

const messageSchema = z.object({ role: z.string().min(1) }).passthrough();
const compactionSchema = z.object({
  summary: z.string().min(1),
  tokensBefore: z.number().int().nonnegative(),
  details: z.unknown().optional(),
  usage: z.unknown().optional(),
});

const rawAgentSessionContextSchema = z.object({
  schemaVersion: z.literal(1),
  compaction: compactionSchema.nullable(),
  messages: z.array(messageSchema).max(1_000),
}).superRefine((value, context) => {
  if (value.compaction !== null && value.messages.length === 0) {
    context.addIssue({ code: "custom", message: "A compacted Agent context must retain at least one message" });
  }
});

export interface AgentSessionContext {
  schemaVersion: 1;
  compaction: {
    summary: string;
    tokensBefore: number;
    details?: unknown;
    usage?: unknown;
  } | null;
  messages: AgentMessage[];
}

export const agentSessionContextSchema = rawAgentSessionContextSchema
  .transform((value) => value as unknown as AgentSessionContext);

/** Restores the logical Pi context into a fresh, request-scoped in-memory session. */
export function restoreAgentContext(sessionManager: SessionManager, value: unknown): void {
  if (value === null || value === undefined) return;
  const context = parseAgentContext(value);
  const messageEntryIds = context.messages.map((message) => sessionManager.appendMessage(message));
  if (context.compaction) {
    sessionManager.appendCompaction(
      context.compaction.summary,
      messageEntryIds[0]!,
      context.compaction.tokensBefore,
      context.compaction.details,
      false,
      context.compaction.usage as CompactionEntry["usage"],
    );
  }
}

/**
 * Exports only Pi's active, compaction-aware branch. Binary image payloads are
 * replaced by stable asset references before the context crosses the process boundary.
 */
export function exportAgentContext(sessionManager: SessionManager,
    currentInputAssetIds: readonly string[]): AgentSessionContext {
  const entries = sessionManager.buildContextEntries();
  const compaction = entries.find((entry): entry is CompactionEntry => entry.type === "compaction");
  const assetIds = [...currentInputAssetIds];
  const messages = entries
    .filter((entry): entry is Extract<SessionEntry, { type: "message" }> => entry.type === "message")
    .map((entry) => sanitizeImages(entry.message as AgentMessage, assetIds));
  return parseAgentContext({
    schemaVersion: 1,
    compaction: compaction ? {
      summary: compaction.summary,
      tokensBefore: compaction.tokensBefore,
      ...(compaction.details === undefined ? {} : { details: compaction.details }),
      ...(compaction.usage === undefined ? {} : { usage: compaction.usage }),
    } : null,
    messages,
  });
}

export function parseAgentContext(value: unknown): AgentSessionContext {
  return agentSessionContextSchema.parse(value);
}

function sanitizeImages(message: AgentMessage, assetIds: string[]): AgentMessage {
  const clone = structuredClone(message) as AgentMessage;
  if (!("content" in clone) || !Array.isArray(clone.content)) return clone;
  const role = Reflect.get(clone, "role");
  const toolAssetId = role === "toolResult" ? detailAssetId(Reflect.get(clone, "details")) : undefined;
  let hasToolAssetReference = toolAssetId !== undefined && clone.content.some((item) =>
    typeof item === "object" && item !== null && Reflect.get(item, "type") === "text"
      && typeof Reflect.get(item, "text") === "string"
      && Reflect.get(item, "text").includes(`Asset ID: ${toolAssetId}`));
  const content: unknown[] = [];
  for (const item of clone.content) {
    if (typeof item === "object" && item !== null && Reflect.get(item, "type") === "image") {
      if (role === "user") {
        const assetId = assetIds.shift();
        content.push({ type: "text", text: assetId
          ? `[本轮参考图片 Asset ID: ${assetId}]`
          : "[图片内容未写入长期上下文]" });
      } else if (role === "toolResult" && toolAssetId && !hasToolAssetReference) {
        content.push({ type: "text", text: `[已读取图片 Asset ID: ${toolAssetId}]` });
        hasToolAssetReference = true;
      } else if (role !== "toolResult") {
        content.push({ type: "text", text: "[图片内容未写入长期上下文]" });
      }
    } else {
      content.push(item);
    }
  }
  Reflect.set(clone, "content", content);
  return clone;
}

function detailAssetId(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const value = Reflect.get(details, "assetId");
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : undefined;
}
