import { describe, expect, it, vi } from "vitest";
import { AgentExecutionStateService } from "../src/agent/agent-execution-state.service.js";

describe("AgentExecutionStateService", () => {
  it("creates the minimal RUNNING ledger before starting a new Pi loop", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const database = fakeDatabase([undefined], insert);
    const service = new AgentExecutionStateService(database as never);

    await expect(service.prepare(command(), now())).resolves.toEqual({ kind: "EXECUTE_AGENT" });
    expect(insert).toHaveBeenCalledOnce();
    expect(database.db.insertInto).toHaveBeenCalledWith("agent_worker_executions");
  });

  it("marks an orphan RUNNING loop interrupted instead of rerunning side effects", async () => {
    const updateResult = vi.fn().mockResolvedValue({ numUpdatedRows: 1n });
    const database = fakeDatabase([{ state: "RUNNING", completion_json: null }], vi.fn(), updateResult);
    const service = new AgentExecutionStateService(database as never);

    await expect(service.prepare(command(), now())).resolves.toEqual({ kind: "FAIL_INTERRUPTED_EXECUTION" });
    expect(updateResult).toHaveBeenCalledOnce();
  });

  it("replays a completed submission without starting Pi again", async () => {
    const completion = { contractVersion: 2, creationId: "151", expectedRevision: 0,
      outcome: "SUCCEEDED", failureCode: null, finalMessage: "完成", activities: [],
      agentContext: { schemaVersion: 1, compaction: null, messages: [] } };
    const database = fakeDatabase([{ state: "COMPLETION_READY", completion_json: JSON.stringify(completion) }]);
    const service = new AgentExecutionStateService(database as never);

    await expect(service.prepare(command(), now())).resolves.toEqual({ kind: "REPLAY_COMPLETION", completion });
  });
});

function command() { return { creationId: 151n, expectedRevision: 0 }; }
function now() { return new Date("2026-09-09T02:00:00Z"); }

function fakeDatabase(selectResults: unknown[], insertExecute = vi.fn(), updateExecute = vi.fn()) {
  const selectExecute = vi.fn(async () => selectResults.shift());
  const selectChain: any = { selectAll: vi.fn(() => selectChain), where: vi.fn(() => selectChain),
    executeTakeFirst: selectExecute };
  const insertChain: any = { values: vi.fn(() => insertChain), execute: insertExecute };
  const updateChain: any = { set: vi.fn(() => updateChain), where: vi.fn(() => updateChain),
    executeTakeFirst: updateExecute };
  return { db: { selectFrom: vi.fn(() => selectChain), insertInto: vi.fn(() => insertChain),
    updateTable: vi.fn(() => updateChain) } };
}
