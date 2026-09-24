import {
  SessionManager,
  type CompactionEntry,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { agentInputFormSchema, agentPendingInputSchema, type AgentInputForm,
  type AgentPendingInput } from "./agent-form-contract.js";
import { REQUEST_USER_INPUT_TOOL_NAME } from "./tools/request-user-input.js";

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

/**
 * Replaces Pi's temporary form Tool Result with the authoritative user outcome.
 * The matching Tool Call and placeholder must both still be present so a corrupt
 * or compacted context can never attach a resolved form to the wrong request.
 */
export function applyAgentInputResult(value: unknown, pendingValue: unknown): AgentSessionContext {
  const context = parseAgentContext(value);
  const pending: AgentPendingInput = agentPendingInputSchema.parse(pendingValue);
  const matchingCalls: Array<{ messageIndex: number; call: Record<string, unknown> }> = [];
  const matchingResults: Array<{ messageIndex: number; result: Record<string, unknown> }> = [];

  context.messages.forEach((message, messageIndex) => {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const item of message.content) {
        if (item.type === "toolCall" && item.id === pending.toolCallId) {
          matchingCalls.push({ messageIndex, call: item as unknown as Record<string, unknown> });
        }
      }
    }
    if (message.role === "toolResult" && message.toolCallId === pending.toolCallId) {
      matchingResults.push({ messageIndex, result: message as unknown as Record<string, unknown> });
    }
  });

  if (matchingCalls.length !== 1 || matchingResults.length !== 1) {
    throw new Error(`Agent input ${pending.toolCallId} requires exactly one matching Tool Call and Tool Result`);
  }
  const { messageIndex: callIndex, call } = matchingCalls[0]!;
  const { messageIndex: resultIndex, result } = matchingResults[0]!;
  if (callIndex >= resultIndex
      || call.name !== REQUEST_USER_INPUT_TOOL_NAME
      || result.toolName !== REQUEST_USER_INPUT_TOOL_NAME
      || result.isError !== false) {
    throw new Error(`Agent input ${pending.toolCallId} does not match a valid request_user_input exchange`);
  }
  const requestedForm = formFromToolArguments(call.arguments);
  const placeholderDetails = result.details;
  const placeholderValue = placeholderDetails && typeof placeholderDetails === "object"
    ? Reflect.get(placeholderDetails, "form") : undefined;
  const placeholderForm = agentInputFormSchema.safeParse(placeholderValue);
  if (!placeholderDetails || typeof placeholderDetails !== "object"
      || Reflect.get(placeholderDetails, "outcome") !== "WAITING_FOR_USER"
      || requestedForm === undefined
      || !placeholderForm.success
      || !isDeepStrictEqual(requestedForm, placeholderForm.data)
      || !isDeepStrictEqual(formDefinition(requestedForm), formDefinition(pending.form))) {
    throw new Error(`Agent input ${pending.toolCallId} does not match its persisted form placeholder`);
  }
  if (pending.status === "PENDING") {
    throw new Error(`Agent input ${pending.toolCallId} has not been resolved`);
  }

  const resolved = pending.status === "SUBMITTED"
    ? { status: pending.status, form: pending.form }
    : { status: pending.status };
  const messages = structuredClone(context.messages);
  messages[resultIndex] = {
    ...messages[resultIndex]!,
    content: [{ type: "text", text: JSON.stringify(resolved) }],
    details: resolved,
    isError: false,
  } as AgentMessage;
  return parseAgentContext({ ...context, messages });
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

function formFromToolArguments(value: unknown): AgentInputForm | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const parsed = agentInputFormSchema.safeParse({ ...value, schemaVersion: 2 });
  return parsed.success ? parsed.data : undefined;
}

function formDefinition(form: AgentInputForm): unknown {
  return {
    ...form,
    fields: form.fields.map(({ value: _value, ...field }) => field),
  };
}
