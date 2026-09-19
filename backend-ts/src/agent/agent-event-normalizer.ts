import type { AgentRuntimeEvent } from "./agent-runtime.js";
import { selectedSkillName, toolOutcome, userFacingPlan } from "./agent-event-utils.js";

export type AgentRealtimeEvent =
  | { eventType: "RUN_STARTED"; payload: Record<string, never> }
  | { eventType: "TEXT_STARTED"; payload: { contentIndex: number } }
  | { eventType: "TEXT_DELTA"; payload: { contentIndex: number; delta: string } }
  | { eventType: "TEXT_FINISHED"; payload: { contentIndex: number } }
  | { eventType: "NARRATION"; payload: { text: string } }
  | { eventType: "SKILL_SELECTED"; payload: { skillName: string } }
  | { eventType: "TOOL_STARTED"; payload: { toolCallId: string; toolName: string } }
  | { eventType: "TOOL_PROGRESS"; payload: { toolCallId: string; toolName: string } }
  | { eventType: "TOOL_FINISHED"; payload: {
      toolCallId: string; toolName: string; outcome: "SUCCEEDED" | "FAILED";
    } };

export interface AgentEventNormalizerOptions {
  emit: (event: AgentRealtimeEvent) => void;
  flushAfterMs?: number;
  flushAfterCharacters?: number;
  maxDeltaBytes?: number;
}

/** Converts Pi observations into the safe transient product stream. Network metadata belongs to the transport. */
export class AgentEventNormalizer {
  private readonly flushAfterMs: number;
  private readonly flushAfterCharacters: number;
  private readonly maxDeltaBytes: number;
  private pending: { contentIndex: number; delta: string } | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly skillCalls = new Map<string, string>();
  private hasTurnNarration = false;

  constructor(private readonly options: AgentEventNormalizerOptions) {
    this.flushAfterMs = options.flushAfterMs ?? 40;
    this.flushAfterCharacters = options.flushAfterCharacters ?? 128;
    this.maxDeltaBytes = options.maxDeltaBytes ?? 64 * 1024;
    if (this.flushAfterMs < 1 || this.flushAfterCharacters < 1 || this.maxDeltaBytes < 4) {
      throw new RangeError("Agent event flush thresholds must be positive");
    }
  }

  accept(event: AgentRuntimeEvent): void {
    switch (event.type) {
      case "agent_start":
        this.options.emit({ eventType: "RUN_STARTED", payload: {} });
        return;
      case "turn_start":
        this.hasTurnNarration = false;
        return;
      case "text_start":
        this.flush();
        this.options.emit({ eventType: "TEXT_STARTED", payload: { contentIndex: event.contentIndex } });
        return;
      case "text_delta":
        this.hasTurnNarration = true;
        this.acceptText(event.contentIndex, event.delta);
        return;
      case "text_end":
        this.flush();
        this.options.emit({ eventType: "TEXT_FINISHED", payload: { contentIndex: event.contentIndex } });
        return;
      case "tool_start":
        this.flush();
        {
          const skillName = selectedSkillName(event.toolName, event.args);
          if (skillName) {
            this.skillCalls.set(event.toolCallId, skillName);
            return;
          }
        }
        if (!this.hasTurnNarration) {
          const plan = userFacingPlan(event.args);
          if (plan) {
            this.hasTurnNarration = true;
            this.options.emit({ eventType: "NARRATION", payload: { text: plan } });
          }
        }
        this.options.emit({ eventType: "TOOL_STARTED",
          payload: { toolCallId: event.toolCallId, toolName: event.toolName } });
        return;
      case "tool_progress":
        if (this.skillCalls.has(event.toolCallId)) return;
        this.flush();
        this.options.emit({ eventType: "TOOL_PROGRESS",
          payload: { toolCallId: event.toolCallId, toolName: event.toolName } });
        return;
      case "tool_end":
        this.flush();
        {
          const skillName = this.skillCalls.get(event.toolCallId);
          if (skillName) {
            this.skillCalls.delete(event.toolCallId);
            if (!event.isError && toolOutcome(event) === "SUCCEEDED") {
              this.options.emit({ eventType: "SKILL_SELECTED", payload: { skillName } });
            }
            return;
          }
        }
        this.options.emit({ eventType: "TOOL_FINISHED", payload: { toolCallId: event.toolCallId,
          toolName: event.toolName, outcome: toolOutcome(event) } });
        return;
      default:
        return;
    }
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const pending = this.pending;
    this.pending = undefined;
    if (pending?.delta) {
      for (const delta of splitUtf8(pending.delta, this.maxDeltaBytes)) {
        this.options.emit({ eventType: "TEXT_DELTA",
          payload: { contentIndex: pending.contentIndex, delta } });
      }
    }
  }

  dispose(): void {
    this.flush();
  }

  private acceptText(contentIndex: number, delta: string): void {
    if (!delta) return;
    if (this.pending && this.pending.contentIndex !== contentIndex) this.flush();
    this.pending = { contentIndex, delta: `${this.pending?.delta ?? ""}${delta}` };
    if ([...this.pending.delta].length >= this.flushAfterCharacters) {
      this.flush();
      return;
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.flushAfterMs);
  }
}

function splitUtf8(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (chunk && bytes + characterBytes > maxBytes) {
      chunks.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += character;
    bytes += characterBytes;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
