import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { assistantItems, toolResultItems } from "./message-items.js";
import { creationStartSchema, formAnswerSchema,
  type CreationItem, type CreationTurn, type ExecutionSnapshot, type GenerationItem } from "./session-contract.js";
import { CREATION_STARTED, FORM_ANSWER } from "./session-store.js";

/** Read the native branch, not the compacted model context: summaries do not erase UI history. */
export function projectSession(entries: SessionEntry[], executions: ExecutionSnapshot[],
    generations: Array<{ creationId: string; item: GenerationItem }> = []): CreationTurn[] {
  const states = new Map(executions.map((execution) => [execution.creationId, execution]));
  const turns: CreationTurn[] = [];
  const lastAssistants = new Map<string, AssistantMessage>();
  let current: CreationTurn | undefined;
  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === CREATION_STARTED) {
      const start = creationStartSchema.parse(entry.data);
      const state = states.get(start.creationId);
      if (!state) throw new Error(`Execution state missing for creation ${start.creationId}`);
      current = { ...start, ...state, createdAt: entry.timestamp, items: [] };
      turns.push(current);
      continue;
    }
    if (!current) continue;
    if (entry.type === "custom_message" && entry.customType === FORM_ANSWER) {
      if (typeof entry.content !== "string") throw new Error("Invalid form answer content");
      const answer = formAnswerSchema.parse(JSON.parse(entry.content));
      if (answer.creationId !== current.creationId) throw new Error("Form answer belongs to another creation");
      const item = current.items.find((item) => item.kind === "form" && item.toolCallId === answer.toolCallId);
      if (item?.kind !== "form") throw new Error("Form answer has no matching tool call");
      item.status = answer.action;
      item.fields = item.fields.map((field) => ({ ...field,
        value: answer.fields.find((value) => value.id === field.id)?.value ?? "" }));
      continue;
    }
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role === "assistant") {
      lastAssistants.set(current.creationId, message);
      for (const item of assistantItems(message)) {
        if (current.mode === "AGENT" || item.kind === "generation") upsert(current.items, item);
      }
    } else if (message.role === "toolResult") {
      const call = current.items.find((item) => item.kind === "tool" && item.toolCallId === message.toolCallId);
      for (const item of toolResultItems(message.toolCallId, message.toolName, message, message.isError,
          call?.kind === "tool" ? call.skillName : undefined)) {
        if (current.mode === "AGENT" || item.kind !== "tool") upsert(current.items, item);
      }
    }
  }
  for (const turn of turns) {
    // SQL is authoritative even if cancellation/crash prevented Pi from saving toolResult.
    for (const generation of generations) if (generation.creationId === turn.creationId) {
      upsert(turn.items, generation.item);
    }
    // Only the last successful assistant message of a completed creation is its final reply.
    // Text preceding a tool call (including a form pause) always remains in the process.
    if (turn.status === "SUCCEEDED" || turn.status === "PARTIALLY_SUCCEEDED") {
      const last = lastAssistants.get(turn.creationId);
      if (last?.stopReason === "stop" && !last.content.some((block) => block.type === "toolCall")) {
        for (const item of assistantItems(last, "final")) upsert(turn.items, item);
      }
    }
    if (turn.status === "CANCELLED" || turn.status === "FAILED") {
      for (const item of turn.items) {
        if (item.kind === "form" && item.status === "PENDING") item.status = "CANCELLED";
        if (item.kind === "tool" && item.status === "RUNNING") item.status = turn.status;
      }
    }
  }
  return turns;
}

function upsert(items: CreationItem[], item: CreationItem): void {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) items.push(item); else items[index] = item;
}
