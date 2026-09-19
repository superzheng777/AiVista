import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { AgentExecuteMessage } from "./agent-execute-message.js";
import { agentCompletionCommandSchema, type AgentCompletionCommand } from "./adapters/java-agent-completion-client.js";

export type AgentExecutionPlan =
  | { kind: "EXECUTE_AGENT" }
  | { kind: "IGNORE_DUPLICATE" }
  | { kind: "REPLAY_COMPLETION"; completion: AgentCompletionCommand }
  | { kind: "FAIL_INTERRUPTED_EXECUTION" };

/** 单实例 Agent 执行账本；不使用租约或周期扫描。 */
@Injectable()
export class AgentExecutionStateService {
  constructor(private readonly database: DatabaseService) {}

  async prepare(command: AgentExecuteMessage, now: Date): Promise<AgentExecutionPlan> {
    let execution = await this.find(command.creationId);
    if (!execution) {
      try {
        await this.database.db.insertInto("agent_worker_executions").values({
          creation_task_id: command.creationId,
          state: "RUNNING",
          completion_json: null,
          started_at: now,
          completed_at: null,
          updated_at: now,
        }).execute();
        return { kind: "EXECUTE_AGENT" };
      } catch (error) {
        execution = await this.find(command.creationId);
        if (!execution) throw error;
      }
    }
    if (execution.state === "COMPLETION_READY" && execution.completion_json) {
      return { kind: "REPLAY_COMPLETION", completion: parse(execution.completion_json) };
    }
    if (execution.state === "RUNNING") {
      const changed = await this.database.db.updateTable("agent_worker_executions")
        .set({ state: "INTERRUPTED", completed_at: now, updated_at: now })
        .where("creation_task_id", "=", command.creationId)
        .where("state", "=", "RUNNING")
        .executeTakeFirst();
      if (changed.numUpdatedRows === 1n) return { kind: "FAIL_INTERRUPTED_EXECUTION" };
      return this.prepare(command, now);
    }
    return { kind: "IGNORE_DUPLICATE" };
  }

  async saveCompletion(creationId: bigint, completion: AgentCompletionCommand, now: Date): Promise<void> {
    const changed = await this.database.db.updateTable("agent_worker_executions")
      .set({ state: "COMPLETION_READY", completion_json: JSON.stringify(completion), completed_at: now,
        updated_at: now })
      .where("creation_task_id", "=", creationId)
      .where("state", "=", "RUNNING")
      .executeTakeFirst();
    if (changed.numUpdatedRows !== 1n) {
      throw new Error(`Cannot save Agent completion for creation ${creationId}`);
    }
  }

  async markInterrupted(creationId: bigint, now: Date): Promise<void> {
    await this.database.db.updateTable("agent_worker_executions")
      .set({ state: "INTERRUPTED", completed_at: now, updated_at: now })
      .where("creation_task_id", "=", creationId)
      .where("state", "=", "RUNNING")
      .executeTakeFirst();
  }

  private find(creationId: bigint) {
    return this.database.db.selectFrom("agent_worker_executions").selectAll()
      .where("creation_task_id", "=", creationId).executeTakeFirst();
  }
}

function parse(value: unknown): AgentCompletionCommand {
  return agentCompletionCommandSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}
