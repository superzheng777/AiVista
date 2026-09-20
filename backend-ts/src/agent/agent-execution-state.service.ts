import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { DatabaseService } from "../database/database.service.js";
import type { AgentExecuteMessage } from "./agent-execute-message.js";
import { agentSessionContextSchema, type AgentSessionContext } from "./agent-context.js";
import { agentCompletionCommandSchema, type AgentCompletionCommand } from "./adapters/java-agent-completion-client.js";
import { agentInputRequestCommandSchema, type AgentInputRequestCommand } from "./adapters/java-agent-form-client.js";

const pauseCheckpointSchema = z.object({
  toolCallId: z.string().min(1).max(128),
  request: agentInputRequestCommandSchema,
  context: agentSessionContextSchema,
});

export type AgentPauseCheckpoint = {
  toolCallId: string;
  request: AgentInputRequestCommand;
  context: AgentSessionContext;
};

export type AgentExecutionPlan =
  | { kind: "EXECUTE_AGENT" }
  | { kind: "RESUME_AGENT"; context: AgentSessionContext }
  | { kind: "IGNORE_DUPLICATE" }
  | { kind: "REPLAY_PAUSE"; checkpoint: AgentPauseCheckpoint }
  | { kind: "REPLAY_COMPLETION"; completion: AgentCompletionCommand }
  | { kind: "FAIL_INTERRUPTED_EXECUTION" };

/** 单实例 Agent 执行账本；保存可重放提交或 Pi 暂停检查点，不使用租约。 */
@Injectable()
export class AgentExecutionStateService {
  constructor(private readonly database: DatabaseService) {}

  async prepare(command: AgentExecuteMessage, now: Date): Promise<AgentExecutionPlan> {
    let execution = await this.find(command.creationId);
    if (!execution) {
      try {
        await this.database.db.insertInto("agent_worker_executions").values({
          creation_task_id: command.creationId,
          execution_revision: BigInt(command.expectedRevision),
          state: "RUNNING",
          payload_json: null,
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
    if (execution.state === "COMPLETION_READY" && execution.payload_json) {
      return { kind: "REPLAY_COMPLETION", completion: parseCompletion(execution.payload_json) };
    }
    if (execution.state === "PAUSE_READY" && execution.payload_json) {
      const checkpoint = parsePause(execution.payload_json);
      if (command.expectedRevision === checkpoint.request.expectedRevision) {
        return { kind: "REPLAY_PAUSE", checkpoint };
      }
      // Java increments once when it enters WAITING_INPUT and once when the answer resumes RUNNING.
      if (command.expectedRevision === checkpoint.request.expectedRevision + 2) {
        const changed = await this.database.db.updateTable("agent_worker_executions")
          .set({ state: "RUNNING", execution_revision: BigInt(command.expectedRevision), payload_json: null,
            started_at: now, completed_at: null, updated_at: now })
          .where("creation_task_id", "=", command.creationId)
          .where("state", "=", "PAUSE_READY")
          .executeTakeFirst();
        if (changed.numUpdatedRows === 1n) return { kind: "RESUME_AGENT", context: checkpoint.context };
        return this.prepare(command, now);
      }
      return { kind: "IGNORE_DUPLICATE" };
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

  async savePause(creationId: bigint, revision: number, checkpoint: AgentPauseCheckpoint,
      now: Date): Promise<void> {
    const value = pauseCheckpointSchema.parse(checkpoint);
    const changed = await this.database.db.updateTable("agent_worker_executions")
      .set({ state: "PAUSE_READY", payload_json: JSON.stringify(value), completed_at: now, updated_at: now })
      .where("creation_task_id", "=", creationId)
      .where("execution_revision", "=", BigInt(revision))
      .where("state", "=", "RUNNING")
      .executeTakeFirst();
    if (changed.numUpdatedRows !== 1n) throw new Error(`Cannot save Agent pause for creation ${creationId}`);
  }

  async saveCompletion(creationId: bigint, completion: AgentCompletionCommand, now: Date): Promise<void> {
    const changed = await this.database.db.updateTable("agent_worker_executions")
      .set({ state: "COMPLETION_READY", payload_json: JSON.stringify(completion), completed_at: now,
        updated_at: now })
      .where("creation_task_id", "=", creationId)
      .where("execution_revision", "=", BigInt(completion.expectedRevision))
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

function parseCompletion(value: unknown): AgentCompletionCommand {
  return agentCompletionCommandSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}

function parsePause(value: unknown): AgentPauseCheckpoint {
  return pauseCheckpointSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}
