import { Injectable } from "@nestjs/common";
import type { Selectable } from "kysely";
import { DatabaseService } from "../database/database.service.js";
import type { GenerationTaskTable } from "../database/database.types.js";
import type { TaskExecuteMessage } from "./generation-task-message.js";

export type GenerationPipelineDecision =
  | { kind: "IGNORE_MESSAGE" }
  | { kind: "DELIVER_COMMITTED_RESULT" }
  | { kind: "EXECUTE_PIPELINE"; task: Selectable<GenerationTaskTable> }
  | { kind: "FAIL_INTERRUPTED_PIPELINE"; task: Selectable<GenerationTaskTable> };

@Injectable()
export class GenerationPipelineStateService {
  constructor(private readonly database: DatabaseService) {}

  async prepare(message: TaskExecuteMessage): Promise<GenerationPipelineDecision> {
    const task = await this.database.db.selectFrom("generation_tasks").selectAll()
      .where("id", "=", message.generationTaskId).executeTakeFirst();
    if (!task) return { kind: "IGNORE_MESSAGE" };
    if (terminal(task.status)) return { kind: "DELIVER_COMMITTED_RESULT" };
    if (task.revision !== message.expectedRevision) return { kind: "IGNORE_MESSAGE" };
    if (task.status === "QUEUED") return { kind: "EXECUTE_PIPELINE", task };
    if (task.status === "GENERATING" || task.status === "SAVING") {
      return { kind: "FAIL_INTERRUPTED_PIPELINE", task };
    }
    return { kind: "IGNORE_MESSAGE" };
  }
}

function terminal(status: string) { return ["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED"].includes(status); }
