import { Injectable } from "@nestjs/common";
import type { Selectable } from "kysely";
import { DatabaseService } from "../database/database.service.js";
import type { GenerationTaskTable } from "../database/database.types.js";
import type { TaskExecuteMessage } from "./generation-task-message.js";

export type PipelinePlan =
  | { kind: "ACK" }
  | { kind: "TERMINAL" }
  | { kind: "START"; task: Selectable<GenerationTaskTable> };

@Injectable()
export class GenerationPipelineStateService {
  constructor(private readonly database: DatabaseService) {}

  async prepare(message: TaskExecuteMessage): Promise<PipelinePlan> {
    const task = await this.database.db.selectFrom("generation_tasks").selectAll()
      .where("id", "=", message.taskId).executeTakeFirst();
    if (!task) return { kind: "ACK" };
    if (terminal(task.status)) return { kind: "TERMINAL" };
    return { kind: "START", task };
  }
}

function terminal(status: string) { return ["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED"].includes(status); }
