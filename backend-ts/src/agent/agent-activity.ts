import type { AgentRuntimeEvent } from "./agent-runtime.js";
import { selectedSkillName, skillLabel, toolLabel, toolOutcomeDetails,
  userFacingPlan } from "./agent-event-utils.js";

export interface AgentActivityItem {
  type: "NARRATION" | "SKILL" | "TOOL";
  outcome: "COMPLETED" | "FAILED" | "CANCELLED";
  content: string;
  toolName: string | null;
  generationTaskId: string | null;
  startedAt: string;
  completedAt: string;
}

type PendingToolActivity = Omit<AgentActivityItem, "outcome" | "completedAt">;

/**
 * Projects Pi events into the small set of stable steps that may be persisted.
 * Text remains pending until a later Tool proves it was narration; final text is never duplicated here.
 */
export class AgentActivityCollector {
  private readonly pendingText: string[] = [];
  private readonly tools = new Map<string, PendingToolActivity>();
  private readonly stable = new Map<string, AgentActivityItem>();
  private narrationSequence = 0;
  private readonly skillCalls = new Map<string, { name: string; startedAt: string }>();
  private hasTurnNarration = false;

  constructor(private readonly now: () => Date = () => new Date()) {}

  accept(event: AgentRuntimeEvent): void {
    if (event.type === "turn_start") {
      this.hasTurnNarration = false;
      return;
    }
    if (event.type === "text_end") {
      const text = event.text.trim();
      if (text) {
        this.hasTurnNarration = true;
        this.pendingText.push(limitCodePoints(text, 1_000));
      }
      return;
    }
    if (event.type === "tool_start") {
      const occurredAt = this.now().toISOString();
      this.flushNarration(occurredAt);
      const skillName = selectedSkillName(event.toolName, event.args);
      if (skillName) {
        this.skillCalls.set(event.toolCallId, { name: skillName, startedAt: occurredAt });
        return;
      }
      if (!this.hasTurnNarration) {
        const plan = userFacingPlan(event.args);
        if (plan) {
          this.hasTurnNarration = true;
          this.pendingText.push(limitCodePoints(plan, 1_000));
          this.flushNarration(occurredAt);
        }
      }
      const activity: PendingToolActivity = {
        type: "TOOL",
        content: `正在执行${toolLabel(event.toolName)}。`,
        toolName: event.toolName,
        generationTaskId: null,
        startedAt: occurredAt,
      };
      this.tools.set(event.toolCallId, activity);
      return;
    }
    if (event.type === "tool_end") {
      const skill = this.skillCalls.get(event.toolCallId);
      if (skill) {
        this.skillCalls.delete(event.toolCallId);
        if (event.isError) return;
        const occurredAt = this.now().toISOString();
        this.record(`skill:${skill.name}`, {
          type: "SKILL",
          outcome: "COMPLETED",
          content: `已启用${skillLabel(skill.name)}。`,
          toolName: null,
          generationTaskId: null,
          startedAt: skill.startedAt,
          completedAt: occurredAt,
        });
        return;
      }
      const existing = this.tools.get(event.toolCallId);
      if (!existing) return;
      const details = toolOutcomeDetails(event.result);
      const failed = event.isError || details.outcome === "FAILED";
      const completed: AgentActivityItem = {
        ...existing,
        outcome: failed ? "FAILED" : "COMPLETED",
        content: failed
          ? `${toolLabel(event.toolName)}未完成。`
          : `${toolLabel(event.toolName)}已完成。`,
        generationTaskId: details.generationTaskId,
        completedAt: this.now().toISOString(),
      };
      this.record(`tool:${event.toolCallId}`, completed);
      return;
    }
    return;
  }

  /** Final assistant text remains a conversation message, not a duplicate NARRATION activity. */
  discardFinalText(): void {
    this.pendingText.length = 0;
  }

  snapshot(): AgentActivityItem[] {
    return [...this.stable.values()].map((activity) => ({ ...activity }));
  }

  private flushNarration(occurredAt: string): void {
    for (const content of this.pendingText.splice(0)) {
      const key = `narration:${++this.narrationSequence}`;
      this.record(key, {
        type: "NARRATION",
        outcome: "COMPLETED",
        content,
        toolName: null,
        generationTaskId: null,
        startedAt: occurredAt,
        completedAt: occurredAt,
      });
    }
  }

  private record(key: string, item: AgentActivityItem): void {
    this.stable.set(key, item);
  }
}

function limitCodePoints(value: string, limit: number): string {
  return Array.from(value).slice(0, limit).join("");
}
