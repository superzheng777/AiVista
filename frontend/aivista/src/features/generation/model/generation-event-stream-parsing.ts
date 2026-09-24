import type {
  AgentFormAnswer,
  AgentInputForm,
  AgentInputFormField,
  CreationForm,
  GenerationTaskStatus,
  PublicationReviewStatus,
} from "@/entities/generation/model/generation";

export type GenerationStreamStatus = "DISCONNECTED" | "CONNECTING" | "SYNCING" | "READY" | "RECONNECTING";

export type GenerationTaskUpdateEvent = {
  sessionId: string;
  generationTaskId: string;
  revision: number;
  status: GenerationTaskStatus;
  retryCount: number;
  maxRetryCount: number;
};

export type PublicationStatusUpdateEvent = {
  imageId: string;
  publicationVersion: number;
  status: PublicationReviewStatus;
  publicAt: string | null;
};

export type GenerationSessionIndicator = "ACTIVE" | "COMPLETED" | "ATTENTION";

export type AgentRealtimeEvent = {
  creationId: string;
  sessionId: string;
  revision: number;
  streamId: string;
  sequence: number;
  eventType:
    | "RUN_STARTED"
    | "RUN_SNAPSHOT"
    | "TEXT_STARTED"
    | "TEXT_DELTA"
    | "TEXT_FINISHED"
    | "NARRATION"
    | "SKILL_SELECTED"
    | "TOOL_STARTED"
    | "TOOL_PROGRESS"
    | "TOOL_FINISHED"
    | "FORM_REQUESTED"
    | "FORM_RESOLVED"
    | "RUN_FINISHED"
    | "RUN_FAILED"
    | "RUN_CANCELLED";
  payload: Record<string, unknown>;
};

export type AgentLiveRun = {
  streamId: string;
  revision: number;
  sequence: number;
  text: string;
  skills: string[];
  tools: Array<{ toolCallId: string; toolName: string; state: "RUNNING" | "SUCCEEDED" | "FAILED" }>;
};

export const TASK_EVENT_NAME = "generation.task.updated";
export const PUBLICATION_EVENT_NAME = "publication.updated";
export const READY_EVENT_NAME = "generation.stream.ready";
export const INTERACTION_NOTIFICATION_EVENT_NAME = "interaction.notification.created";
export const AGENT_EVENT_NAME = "agent.creation.event";
export const MAX_RECONNECT_DELAY_MS = 3_000;

/** 发布终态：只有这些状态才允许驱动“信号 → 全量重拉”。 */
export const PUBLICATION_TERMINAL_STATUSES: ReadonlySet<string> = new Set(["APPROVED", "REJECTED", "FAILED"]);
const GENERATION_TASK_STATUSES: ReadonlySet<string> = new Set([
  "QUEUED",
  "GENERATING",
  "SAVING",
  "SUCCEEDED",
  "PARTIALLY_SUCCEEDED",
  "FAILED",
]);
const CREATION_FORM_STATUSES: ReadonlySet<string> = new Set(["PENDING", "SUBMITTED", "SKIPPED", "CANCELLED"]);

export function isTaskUpdateEvent(value: unknown): value is GenerationTaskUpdateEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<GenerationTaskUpdateEvent>;
  return (
    typeof event.sessionId === "string" &&
    typeof event.generationTaskId === "string" &&
    isNonNegativeSafeInteger(event.revision) &&
    typeof event.status === "string" &&
    GENERATION_TASK_STATUSES.has(event.status) &&
    isNonNegativeSafeInteger(event.retryCount) &&
    isNonNegativeSafeInteger(event.maxRetryCount)
  );
}

export function isPublicationStatusUpdateEvent(value: unknown): value is PublicationStatusUpdateEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<PublicationStatusUpdateEvent>;
  if (typeof event.imageId !== "string") return false;
  if (typeof event.publicationVersion !== "number" || !Number.isSafeInteger(event.publicationVersion)) return false;
  if (typeof event.status !== "string" || !PUBLICATION_TERMINAL_STATUSES.has(event.status)) return false;
  return event.publicAt === null || typeof event.publicAt === "string";
}

export function isAgentRealtimeEvent(value: unknown): value is AgentRealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<AgentRealtimeEvent>;
  return (
    typeof event.creationId === "string" &&
    typeof event.sessionId === "string" &&
    Number.isSafeInteger(event.revision) &&
    typeof event.streamId === "string" &&
    event.streamId.length > 0 &&
    Number.isSafeInteger(event.sequence) &&
    (event.sequence ?? 0) > 0 &&
    typeof event.eventType === "string" &&
    AGENT_EVENT_TYPES.has(event.eventType) &&
    !!event.payload &&
    typeof event.payload === "object" &&
    !Array.isArray(event.payload)
  );
}

const AGENT_EVENT_TYPES: ReadonlySet<string> = new Set([
  "RUN_STARTED",
  "RUN_SNAPSHOT",
  "TEXT_STARTED",
  "TEXT_DELTA",
  "TEXT_FINISHED",
  "NARRATION",
  "SKILL_SELECTED",
  "TOOL_STARTED",
  "TOOL_PROGRESS",
  "TOOL_FINISHED",
  "FORM_REQUESTED",
  "FORM_RESOLVED",
  "RUN_FINISHED",
  "RUN_FAILED",
  "RUN_CANCELLED",
]);

export function agentFormFromEvent(event: AgentRealtimeEvent): CreationForm | null {
  if (event.eventType !== "FORM_REQUESTED" && event.eventType !== "FORM_RESOLVED") return null;
  const value = event.payload.form;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.formId !== "string" ||
    typeof raw.status !== "string" ||
    !CREATION_FORM_STATUSES.has(raw.status) ||
    !isAgentInputForm(raw.form) ||
    typeof raw.requestedAt !== "string" ||
    !(raw.resolvedAt === null || typeof raw.resolvedAt === "string") ||
    !(raw.answers === null || isAgentFormAnswers(raw.answers))
  )
    return null;
  return {
    id: raw.formId,
    status: raw.status as CreationForm["status"],
    form: raw.form,
    answers: raw.answers,
    requestedAt: raw.requestedAt,
    resolvedAt: raw.resolvedAt as string | null,
  };
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isAgentInputForm(value: unknown): value is AgentInputForm {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const form = value as Record<string, unknown>;
  return (
    form.schemaVersion === 1 &&
    typeof form.title === "string" &&
    Array.isArray(form.fields) &&
    form.fields.every(isAgentInputFormField)
  );
}

function isAgentInputFormField(value: unknown): value is AgentInputFormField {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const field = value as Record<string, unknown>;
  const hasBaseFields =
    typeof field.id === "string" &&
    typeof field.label === "string" &&
    typeof field.required === "boolean" &&
    isOptionalString(field.initialValue);
  if (!hasBaseFields) return false;
  if (field.type === "TEXT") return isOptionalString(field.placeholder);
  if (
    field.type !== "SINGLE_SELECT" ||
    typeof field.allowCustom !== "boolean" ||
    !isOptionalString(field.customLabel) ||
    !isOptionalString(field.customInitialValue) ||
    !Array.isArray(field.options)
  )
    return false;
  return field.options.every((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) return false;
    const candidate = option as Record<string, unknown>;
    return typeof candidate.value === "string" && typeof candidate.label === "string";
  });
}

function isAgentFormAnswers(value: unknown): value is Record<string, AgentFormAnswer> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((answer) => {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
    const candidate = answer as Record<string, unknown>;
    return ["TEXT", "OPTION", "CUSTOM"].includes(String(candidate.kind)) && typeof candidate.value === "string";
  });
}

export function applyAgentRealtimeEvent(current: AgentLiveRun | undefined, event: AgentRealtimeEvent): AgentLiveRun {
  if (current && event.revision < current.revision) return current;
  if (current && event.streamId === current.streamId && event.sequence <= current.sequence) return current;
  const resumesPausedRun = !!current && event.eventType === "RUN_STARTED" && event.revision > current.revision;
  const next =
    !current || event.streamId !== current.streamId
      ? {
          streamId: event.streamId,
          revision: event.revision,
          sequence: 0,
          text: resumesPausedRun ? current.text : "",
          skills: resumesPausedRun ? [...current.skills] : [],
          tools: resumesPausedRun ? [...current.tools] : [],
        }
      : { ...current, skills: [...current.skills], tools: [...current.tools] };
  next.sequence = event.sequence;
  if (event.eventType === "RUN_STARTED") return resumesPausedRun ? next : { ...next, text: "", skills: [], tools: [] };
  if (event.eventType === "RUN_SNAPSHOT" && snapshotPayload(event.payload)) {
    return {
      ...next,
      text: event.payload.text,
      skills: [...event.payload.skills],
      tools: event.payload.tools.map((tool) => ({ ...tool })),
    };
  }
  if (event.eventType === "TEXT_DELTA" && typeof event.payload.delta === "string") {
    next.text += event.payload.delta;
  }
  if (event.eventType === "NARRATION" && typeof event.payload.text === "string") {
    next.text += event.payload.text;
  }
  if (
    event.eventType === "SKILL_SELECTED" &&
    typeof event.payload.skillName === "string" &&
    !next.skills.includes(event.payload.skillName)
  ) {
    next.skills.push(event.payload.skillName);
  }
  if (event.eventType === "TOOL_STARTED" && toolPayload(event.payload)) {
    next.tools = [
      ...next.tools.filter((tool) => tool.toolCallId !== event.payload.toolCallId),
      { toolCallId: event.payload.toolCallId, toolName: event.payload.toolName, state: "RUNNING" },
    ];
  }
  if (event.eventType === "TOOL_FINISHED" && toolPayload(event.payload)) {
    const state = event.payload.outcome === "FAILED" ? "FAILED" : "SUCCEEDED";
    next.tools = next.tools.map((tool) => (tool.toolCallId === event.payload.toolCallId ? { ...tool, state } : tool));
  }
  return next;
}

function toolPayload(
  payload: Record<string, unknown>,
): payload is Record<string, unknown> & { toolCallId: string; toolName: string } {
  return typeof payload.toolCallId === "string" && typeof payload.toolName === "string";
}

function snapshotPayload(payload: Record<string, unknown>): payload is Record<string, unknown> & {
  text: string;
  skills: string[];
  tools: Array<{ toolCallId: string; toolName: string; state: "RUNNING" | "SUCCEEDED" | "FAILED" }>;
} {
  return (
    typeof payload.text === "string" &&
    Array.isArray(payload.skills) &&
    payload.skills.every((value) => typeof value === "string") &&
    Array.isArray(payload.tools) &&
    payload.tools.every((value) => {
      if (!value || typeof value !== "object") return false;
      const tool = value as Record<string, unknown>;
      return (
        typeof tool.toolCallId === "string" &&
        typeof tool.toolName === "string" &&
        ["RUNNING", "SUCCEEDED", "FAILED"].includes(String(tool.state))
      );
    })
  );
}

export function isTerminalStatus(status: GenerationTaskStatus): boolean {
  return status === "SUCCEEDED" || status === "PARTIALLY_SUCCEEDED" || status === "FAILED";
}

export function parseSseBlock(block: string): { eventName: string; data: string } | null {
  let eventName = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
    if (line.startsWith("data:")) data.push(line.slice("data:".length).trimStart());
  }
  return data.length ? { eventName, data: data.join("\n") } : null;
}

export function reconnectDelayMs(attempt: number): number {
  return Math.min(1_000 * 2 ** (attempt - 1), MAX_RECONNECT_DELAY_MS);
}

export async function consumeSseStream(
  response: Response,
  onReady: () => void,
  onTaskUpdate: (event: GenerationTaskUpdateEvent) => void,
  onPublicationUpdate: (event: PublicationStatusUpdateEvent) => void,
  onInteractionNotification: () => void = () => undefined,
  onAgentEvent: (event: AgentRealtimeEvent) => void = () => undefined,
): Promise<void> {
  if (!response.body) throw new Error("The event stream has no response body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  while (true) {
    const { done, value } = await reader.read();
    pending = (pending + decoder.decode(value, { stream: !done })).replaceAll("\r\n", "\n");
    let boundary = pending.indexOf("\n\n");
    while (boundary !== -1) {
      const parsed = parseSseBlock(pending.slice(0, boundary));
      pending = pending.slice(boundary + 2);
      boundary = pending.indexOf("\n\n");
      if (!parsed) continue;
      if (parsed.eventName === READY_EVENT_NAME) {
        onReady();
        continue;
      }
      if (parsed.eventName === INTERACTION_NOTIFICATION_EVENT_NAME) {
        onInteractionNotification();
        continue;
      }
      try {
        const event: unknown = JSON.parse(parsed.data);
        if (parsed.eventName === TASK_EVENT_NAME && isTaskUpdateEvent(event)) {
          onTaskUpdate(event);
        } else if (parsed.eventName === PUBLICATION_EVENT_NAME && isPublicationStatusUpdateEvent(event)) {
          onPublicationUpdate(event);
        } else if (parsed.eventName === AGENT_EVENT_NAME && isAgentRealtimeEvent(event)) {
          onAgentEvent(event);
        }
      } catch {
        // REST reconciliation after the next connection remains authoritative.
      }
    }
    if (done) return;
  }
}
