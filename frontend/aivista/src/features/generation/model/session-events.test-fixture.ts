import type { SessionDetail } from "@/entities/generation/model/session";

export function sessionFixture(): SessionDetail {
  return { schemaVersion: 1, sessionId: "1", title: "海报设计", creationCount: 1, creationLimit: 30,
    lastMessageAt: "2026-10-07T00:00:00Z", turns: [{ creationId: "2", mode: "AGENT", status: "RUNNING", revision: 1,
      input: { prompt: "制作海报", assets: [] }, settings: {}, items: [],
      createdAt: "2026-10-07T00:00:00Z", completedAt: null, failureCode: null }] };
}
