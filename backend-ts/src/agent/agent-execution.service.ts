import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment.js";
import { GenerationCompletionCoordinatorService } from "../generation/generation-completion-coordinator.service.js";
import { JavaAgentCompletionClient, agentCompletionCommandSchema,
  type AgentCompletionCommand } from "./adapters/java-agent-completion-client.js";
import { JavaGenerationClient } from "./adapters/java-generation-client.js";
import type { AgentExecuteMessage } from "./agent-execute-message.js";
import { AgentExecutionStateService } from "./agent-execution-state.service.js";
import { AgentImageLoaderService } from "./agent-image-loader.service.js";
import { AgentModelService } from "./agent-model.service.js";
import { runAgentPrompt, AgentTurnLimitError } from "./agent-runtime.js";
import { AgentGenerationToolExecutor, createGenerationTools, createSkillReadTool } from "./tools/index.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentActivityCollector, type AgentActivityItem } from "./agent-activity.js";
import { AgentEventNormalizer } from "./agent-event-normalizer.js";
import { JavaAgentRealtimeClient } from "./adapters/java-agent-realtime-client.js";
import { JavaAgentActivityClient } from "./adapters/java-agent-activity-client.js";

/** 一条 AGENT_EXECUTE 命令的完整可靠执行边界。 */
@Injectable()
export class AgentExecutionService {
  private readonly active = new Map<string, { revision: number; abort: AbortController }>();

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly state: AgentExecutionStateService,
    private readonly java: JavaGenerationClient,
    private readonly completionClient: JavaAgentCompletionClient,
    private readonly images: AgentImageLoaderService,
    private readonly models: AgentModelService,
    private readonly generationCompletions: GenerationCompletionCoordinatorService,
    private readonly realtime: JavaAgentRealtimeClient,
    private readonly activityClient: JavaAgentActivityClient,
  ) {
    this.realtime.subscribeControl((control) => {
      if (control.type === "READY") {
        void this.reconcileActive();
        return;
      }
      const execution = this.active.get(control.creationTaskId);
      if (execution && control.revision > execution.revision) execution.abort.abort("USER_CANCELLED");
    });
  }

  async execute(command: AgentExecuteMessage, signal?: AbortSignal): Promise<boolean> {
    const id = command.creationTaskId.toString();
    if (this.active.has(id)) return true;
    const cancellation = new AbortController();
    this.active.set(id, { revision: command.revision, abort: cancellation });
    try {
      const snapshot = await this.java.getAgentExecution(id, signal);
      if (snapshot.status !== "RUNNING" || snapshot.revision !== command.revision) return true;
      const plan = await this.state.prepare(command, false, new Date());
      if (plan.kind === "ACK") return true;
      if (plan.kind === "REPLAY") {
        await this.completionClient.complete(agentCompletionCommandSchema.parse(plan.completion), signal);
        return true;
      }
      if (plan.kind === "INTERRUPTED") {
        await this.completionClient.complete(failure(command, "AGENT_RUNTIME_INTERRUPTED",
          "上一次创作执行意外中断，请重新发起。"), signal);
        return true;
      }
      let completion: AgentCompletionCommand;
      const activityCollector = new AgentActivityCollector();
      const realtime = new AgentEventNormalizer({ emit: (event) => {
        this.realtime.publish(id, command.revision, event);
      } });
      let activityWrites = Promise.resolve();
      try {
        const inputImages = await this.images.load(snapshot.inputAssets);
        const binding = await this.models.get();
        const executor = new AgentGenerationToolExecutor({ creationTaskId: id, java: this.java,
          completions: this.generationCompletions,
          toolWaitTimeoutMs: this.config.get("AIVISTA_AGENT_TOOL_WAIT_TIMEOUT_MS", { infer: true }) });
        const cwd = resolve(fileURLToPath(new URL("../../", import.meta.url)));
        const tools = [createSkillReadTool(cwd), ...createGenerationTools({ executor,
          authorizedInputAssetIds: new Set(snapshot.inputAssets.map((asset) => asset.assetId)),
          constraints: snapshot.constraints })];
        const loopTimeout = AbortSignal.timeout(this.config.get("AIVISTA_AGENT_LOOP_TIMEOUT_MS", { infer: true }));
        const runSignal = signal
          ? AbortSignal.any([signal, loopTimeout, cancellation.signal])
          : AbortSignal.any([loopTimeout, cancellation.signal]);
        await this.realtime.waitUntilReady(runSignal);
        realtime.start();
        const result = await runAgentPrompt({ binding, prompt: snapshot.prompt, history: snapshot.history,
          images: inputImages, authorizedInputAssetIds: snapshot.inputAssets.map((asset) => asset.assetId), tools,
          generationConstraints: snapshot.constraints,
          maxTurns: this.config.get("AIVISTA_AGENT_MAX_TURNS", { infer: true }),
          signal: runSignal, onEvent: (event) => {
            const stable = activityCollector.accept(event);
            if (stable.length) {
              activityWrites = activityWrites.then(() => this.activityClient.submit({ contractVersion: 1,
                creationTaskId: id, revision: command.revision, activities: stable })).then(() => undefined)
                .catch(() => undefined);
            }
            realtime.accept(event);
          } });
        await activityWrites;
        activityCollector.discardFinalText();
        completion = success(command, result.text, activityCollector.snapshot());
      } catch (error) {
        if (cancellation.signal.aborted) {
          await activityWrites;
          await this.state.markInterrupted(command.creationTaskId, new Date());
          return true;
        }
        if (signal?.aborted) throw error;
        await activityWrites;
        activityCollector.discardFinalText();
        completion = failure(command, failureCode(error), "这次创作没有完成，请调整描述后重试。",
          activityCollector.snapshot());
      } finally {
        realtime.dispose();
      }
      await this.state.saveCompletion(command.creationTaskId, completion, new Date());
      await this.completionClient.complete(completion, signal);
      return true;
    } finally {
      this.active.delete(id);
    }
  }

  private async reconcileActive(): Promise<void> {
    for (const [id, execution] of this.active) {
      try {
        const snapshot = await this.java.getAgentExecution(id);
        if (snapshot.status !== "RUNNING" || snapshot.revision !== execution.revision) {
          execution.abort.abort("AUTHORITATIVE_STATE_CHANGED");
        }
      } catch { /* The next reconnect or completion boundary will converge again. */ }
    }
  }
}

function success(command: AgentExecuteMessage, text: string, activities: AgentActivityItem[]): AgentCompletionCommand {
  return { contractVersion: 1, completionId: `agent-${command.creationTaskId}`,
    creationTaskId: command.creationTaskId.toString(), revision: command.revision,
    outcome: "SUCCEEDED", failureCode: null, finalMessage: text, activities };
}

function failure(command: AgentExecuteMessage, code: string, message: string,
    activities: AgentActivityItem[] = []): AgentCompletionCommand {
  return { contractVersion: 1, completionId: `agent-${command.creationTaskId}`,
    creationTaskId: command.creationTaskId.toString(), revision: command.revision,
    outcome: "FAILED", failureCode: code, finalMessage: message, activities };
}

function failureCode(error: unknown): string {
  if (error instanceof AgentTurnLimitError) return "AGENT_TURN_LIMIT_REACHED";
  if (error instanceof Error && error.message.includes("empty final response")) return "EMPTY_AGENT_RESPONSE";
  return "AGENT_RUNTIME_FAILED";
}
