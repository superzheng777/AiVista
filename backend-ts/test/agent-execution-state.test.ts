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
    const database = fakeDatabase([{ state: "RUNNING", payload_json: null }], vi.fn(), updateResult);
    const service = new AgentExecutionStateService(database as never);

    await expect(service.prepare(command(), now())).resolves.toEqual({ kind: "FAIL_INTERRUPTED_EXECUTION" });
    expect(updateResult).toHaveBeenCalledOnce();
  });

  it("replays a completed submission without starting Pi again", async () => {
    const completion = { contractVersion: 2, creationId: "151", expectedRevision: 0,
      outcome: "SUCCEEDED", failureCode: null, finalMessage: "完成", activities: [],
      agentContext: { schemaVersion: 1, compaction: null, messages: [] } };
    const database = fakeDatabase([{ state: "COMPLETION_READY", payload_json: JSON.stringify(completion) }]);
    const service = new AgentExecutionStateService(database as never);

    await expect(service.prepare(command(), now())).resolves.toEqual({ kind: "REPLAY_COMPLETION", completion });
  });

  it("marks the next revision as a resume only after Java resolves the form", async () => {
    const delivery = pauseDelivery();
    const updateResult = vi.fn().mockResolvedValue({ numUpdatedRows: 1n });
    const database = fakeDatabase([{ state: "PAUSE_READY", execution_revision: 0n,
      payload_json: JSON.stringify(delivery) }],
      vi.fn(), updateResult);
    const service = new AgentExecutionStateService(database as never);

    await expect(service.prepare({ creationId: 151n, expectedRevision: 2 }, now()))
      .resolves.toEqual({ kind: "RESUME_AGENT" });
    expect(updateResult).toHaveBeenCalledOnce();
  });

  it("resumes from the ledger revision after the acknowledged pause payload was cleared", async () => {
    const updateResult = vi.fn().mockResolvedValue({ numUpdatedRows: 1n });
    const database = fakeDatabase([{ state: "PAUSE_READY", execution_revision: 0n, payload_json: null }],
      vi.fn(), updateResult);
    const service = new AgentExecutionStateService(database as never);

    await expect(service.prepare({ creationId: 151n, expectedRevision: 2 }, now()))
      .resolves.toEqual({ kind: "RESUME_AGENT" });
  });

  it("replays a saved form request when the original Java response was lost", async () => {
    const delivery = pauseDelivery();
    const database = fakeDatabase([{ state: "PAUSE_READY", execution_revision: 0n,
      payload_json: JSON.stringify(delivery) }]);
    const service = new AgentExecutionStateService(database as never);

    await expect(service.prepare(command(), now())).resolves.toEqual({
      kind: "REPLAY_PAUSE_DELIVERY", delivery,
    });
  });

  it("clears only the transient pause delivery payload after Java accepts it", async () => {
    const updateResult = vi.fn().mockResolvedValue({ numUpdatedRows: 1n });
    const database = fakeDatabase([], vi.fn(), updateResult);
    const service = new AgentExecutionStateService(database as never);

    await service.clearPauseDelivery(151n, 0, now());

    expect(database.updateChain.set).toHaveBeenCalledWith({ payload_json: null, updated_at: now() });
  });

  it("rejects an invalid completion before it can enter the replay ledger", async () => {
    const database = fakeDatabase([]);
    const service = new AgentExecutionStateService(database as never);

    await expect(service.saveCompletion(151n, {
      contractVersion: 2,
      creationId: "151",
      expectedRevision: 0,
      outcome: "SUCCEEDED",
      failureCode: null,
      finalMessage: null,
      activities: [],
      agentContext: context(),
    } as never, now())).rejects.toThrow();

    expect(database.db.updateTable).not.toHaveBeenCalled();
  });
});

function command() { return { creationId: 151n, expectedRevision: 0 }; }
function now() { return new Date("2026-09-09T02:00:00Z"); }
function form() { return { schemaVersion: 2 as const, title: "确认需求", fields: [
  { id: "subject", type: "TEXT" as const, label: "主题", required: true, value: "关爱动物" },
] }; }
function pauseDelivery() { return { toolCallId: "call-form-1", request: { contractVersion: 2 as const,
  expectedRevision: 0, form: form(), activities: [], agentContext: context() } }; }
function context() { return { schemaVersion: 1 as const, compaction: null, messages: [] }; }

function fakeDatabase(selectResults: unknown[], insertExecute = vi.fn(), updateExecute = vi.fn()) {
  const selectExecute = vi.fn(async () => selectResults.shift());
  const selectChain: any = { selectAll: vi.fn(() => selectChain), where: vi.fn(() => selectChain),
    executeTakeFirst: selectExecute };
  const insertChain: any = { values: vi.fn(() => insertChain), execute: insertExecute };
  const updateChain: any = { set: vi.fn(() => updateChain), where: vi.fn(() => updateChain),
    executeTakeFirst: updateExecute };
  return { updateChain, db: { selectFrom: vi.fn(() => selectChain), insertInto: vi.fn(() => insertChain),
    updateTable: vi.fn(() => updateChain) } };
}
