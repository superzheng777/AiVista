# Agent 模式模块

> 状态：一期核心链路已实现，文生图与图生图复用普通生成 Pipeline
>
> 基线：Java Core + TypeScript AI Runtime + Pi-Agent + RabbitMQ + MySQL + OSS
>
> 部署假设：Java 与 TypeScript 各单实例；不引入分布式租约、多 Agent 或通用工作流引擎

## 1. 最终架构

Java 是浏览器唯一业务入口和业务事实拥有者；TypeScript 负责 Pi Loop、模型调用、图片生成、下载和 OSS 转存。两端职责如下：

| 能力 | Java Core | TypeScript AI Runtime |
| --- | --- | --- |
| 用户、认证、社区、发布、通知、搜索 | 唯一负责 | 不负责 |
| Generation Session、消息、Creation、Agent Context | 创建、查询和最终事务提交 | 读取并更新受控 Pi 逻辑上下文 |
| 额度、Generation Task、Image Asset | 唯一写入业务表 | 执行 Provider 与 OSS I/O |
| 浏览器 REST/SSE | 唯一入口 | 不直接暴露给浏览器 |
| Pi Session、Skill、Tool、Loop | 不执行 | 唯一负责 |
| Agent Worker Ledger | 不写入 | 保存执行防重与可重放 Completion |

一次用户提问对应一个 Creation 和一个短生命周期 Pi Session。一个 Creation 可以创建零到多个 Generation Task；没有 Tool Call 且存在非空模型文本时，Pi Loop 正常成功。每个 Loop 最多 20 Turn。

MySQL 中的 Generation Session 是跨轮逻辑会话。每个 Creation 使用 `SessionManager.inMemory(explicitCwd)` 创建短生命周期 Pi Session，结束后释放；`agent_session_contexts` 只保存 Pi 当前有效的压缩摘要与近期完整消息。它不是第二份产品消息表，也不保存 JSONL 文件、图片 Base64、逐 Token、真实思维链或 Provider 原始事件。

## 2. 完整链路

```text
Browser
  → POST /agent-creations
Java（一个事务）
  → Creation(RUNNING) + USER Message + 授权图片 + AGENT_EXECUTE Outbox
RabbitMQ
  → { creationId, expectedRevision }
TS Agent Worker
  → 读取 Java 权威执行快照
  → 加载本轮授权 OSS 图片为 Pi ImageContent
  → 将会话级 Agent Context 恢复进 Pi Session，注入本轮约束、Skill 元数据与 Tool
  → Pi 可调用 inspect_image 理解历史图片，并调用 text_to_image / image_to_image 零到多次
Agent Tool
  → PUT 创建或读取同一 Generation Task
Java
  → Generation Task(QUEUED) + 额度预占 + GENERATION_TASK_EXECUTE Outbox
TS Generation Worker
  → Provider → 下载 → OSS
  → PUT Generation Completion
Java（一个事务）
  → Generation Task 终态 + Image Asset + 额度处理
TS Coordinator
  → 以权威 Asset ID/失败码唤醒 Tool
Pi
  → Tool Result 进入下一 Turn，继续调用 Tool 或输出最终回答
TS Agent Worker
  → 先保存 COMPLETION_READY Ledger
  → PUT Agent Completion
Java（一个事务）
  → 最终 Activities + ASSISTANT Message + Agent Context + Creation 终态
TS
  → ACK AGENT_EXECUTE
```

RabbitMQ 只负责 Java 向 TS 派发命令。TS 向 Java 提交最终结果使用幂等 PUT；Java–TS WebSocket只承载实时事件、心跳和取消，不承载可靠业务结果。

## 3. 创建、防重与 ACK

浏览器创建普通任务或 Agent Creation 不再发送 `Idempotency-Key`，前端也不在 `sessionStorage` 保存或自动重放 POST。当前产品在同一会话只允许一个 `RUNNING` Creation；响应不确定时刷新会话快照即可确认是否已经创建。

必须保留的可靠性边界：

- Java 创建 Creation/Generation Task 时，同一事务写业务数据和 Outbox。
- Outbox 使用 Publisher Confirm；RabbitMQ 为 at-least-once，消费者手动 ACK/NACK。
- `GENERATION_TASK_EXECUTE` 为 `{ generationTaskId, expectedRevision }`。
- `AGENT_EXECUTE` 为 `{ creationId, expectedRevision }`。
- TS 进程内 active Set/Map 阻止同一实例并发执行同一命令。
- Generation Completion 使用 `generationTaskId + expectedRevision + 终态检查` 收敛重投。
- Agent Loop 不能安全重跑，因此使用 `agent_worker_executions` Ledger。

Agent Tool 直接使用 Pi `toolCallId` 作为调用标识，不再派生 UUID：

```text
PUT /internal/generation-worker/agent-creations/{creationId}/generation-tasks/{toolCallId}
```

数据库唯一键为 `(creation_task_id, tool_call_id)`。相同 Tool Call 和相同规范化参数返回已有 Generation Task；相同 ID 但参数不同返回冲突。这样 HTTP 响应丢失时可以有限重试，而不会重复扣额度或重复写 Outbox。

Generation 与 Agent Completion 都最多重试 3 次网络错误或 5xx。仍失败则当前 MQ 消息 NACK；重投后通过任务终态或 Agent Ledger 收敛。消费者只在 Java Completion 已确认或权威状态已是相同终态时 ACK。

## 4. Pi Runtime、Skill 与 Tool

- 主模型为百炼 `qwen3.8-flash`，关闭 Thinking；图片生成模型为 `qwen-image-2.0`。
- 中文系统提示词位于 `backend-ts/.pi/SYSTEM.md`。
- `poster-design` 位于 `backend-ts/.pi/skills/poster-design/SKILL.md`。
- Pi 先看到 Skill 的 `name/description/location`，命中后使用受限 `read` 渐进读取正文。
- `read` 保留 Pi 官方 Tool 形态，但执行器只允许规范化后仍位于 `.pi/skills` 根目录内的路径。
- 显式业务 Tool 为 `text_to_image`、`image_to_image` 与 `inspect_image`，使用 Pi `defineTool` 和 TypeBox。
- Harness 校验 Tool 白名单、参数语义、Creation 级比例/数量约束、Asset 授权、20 Turn、超时与 `AbortSignal`。
- Skill 是提示与步骤，不是权限来源；系统规则和 Harness 始终优先。

Tool 无论成功或失败都返回 Pi 官方可消费的 `{ content, details }`。`content` 给模型解释成功结果或可修正错误；`details` 保存 `outcome`、`generationTaskId`、Asset ID 或安全失败码，供 Runtime 投影使用。原始异常、Provider 响应和内部路径不进入模型或浏览器。

同方向多图可由一次 Tool Call 的 `imageCount` 完成；不同设计方向可以产生多个 Tool Call。用户指定比例或数量时，它们作为受信任系统约束注入本轮，Harness 校验模型参数一致；默认 `AUTO/0` 时由模型决定，总图片数量最多 6。

## 5. 会话与 Agent Context

Java Execution Snapshot V2 返回当前 USER prompt、当前会话唯一的 `agentContext`、本轮授权图片和 Creation 级生成约束。普通模式不读取或修改 Agent Context；上下文严格以 Generation Session 隔离。

```json
{
  "schemaVersion": 1,
  "compaction": null,
  "messages": []
}
```

- `messages` 保留 Pi 的近期完整 USER、ASSISTANT、Tool Call 和 Tool Result，而不是从产品消息表重新伪造模型历史。
- `compaction` 保存 Pi 原生自动压缩产生的摘要、`tokensBefore` 及可选元数据；Runtime 使用 `SettingsManager.inMemory` 开启 Pi 的阈值判断和自动压缩。
- 每轮启动时 Codec 将 Context 恢复到新的 `SessionManager.inMemory`；Pi 稳定结束后导出当前 active branch。
- 当前明确引用的图片作为本轮 `ImageContent` 注入；导出时图片二进制替换为 Asset ID 文本引用，绝不落库 Base64/Data URI。
- 历史图片默认只以 Asset ID 留在 Context。模型确需理解画面时调用 `inspect_image`；Java只允许读取当前用户在同一 Generation Session 中使用或成功生成、仍然有效的资产，并校验活动 Creation 的 revision。TS从私有 OSS恢复的 `ImageContent` 只存在于当前 Loop；Tool Result导出时再次删除 Base64并保留准确 Asset ID。历史图片若要作为图生图输入，仍应由用户在当前请求中明确选择。
- 成功 Completion 才携带新 Context；Java从 Creation 获取可信 `sessionId`，并在同一事务内写 Context、最终消息、Activity 和 Creation 终态。失败或取消不覆盖上一次成功 Context。
- `conversation_messages` 继续只负责前端长期展示，`agent_session_contexts` 负责下一轮模型输入；不增加消息游标、租约、版本列或另一套逐消息表。

## 6. 实时事件与最终 Activity

Pi 原生事件由 `AgentEventNormalizer` 映射为最小产品事件：

- `RUN_STARTED`
- `TEXT_STARTED / TEXT_DELTA / TEXT_FINISHED`
- `NARRATION`
- `SKILL_SELECTED`
- `TOOL_STARTED / TOOL_PROGRESS / TOOL_FINISHED`
- Java 提交的 `RUN_FINISHED / RUN_FAILED / RUN_CANCELLED`

TS 将安全事件通过一个实例级 WebSocket发送给 Java；Java验证 Creation 所有权、模式、状态与 revision，补齐用户和会话路由，再通过用户级 SSE 发给浏览器。前端直接消费 `TEXT_DELTA`，不伪造逐字符输出。

中间 Activity 不写数据库，也没有 Activity HTTP 接口。Java 的内存投影会聚合文字、Skill 和 Tool 状态；浏览器 SSE 新建或重连时收到 `RUN_SNAPSHOT`，以 `streamId + sequence` 恢复当前安全过程。最终状态仍由 REST 快照兜底。

Pi 的 `agent_settled` 只作为 Runtime 内部收口屏障，不作为产品事件。稳定结束后，TS 在 Agent Completion V2 中提交按顺序排列的最终 Activities 与 Agent Context。Java在同一事务内一次性写入 Activities、最终 ASSISTANT Message、Agent Context 和 Creation 终态。`creation_activities` 只保存不可变终态步骤：

```text
sequence_no + activity_type + outcome + content
+ optional tool_name + optional generation_task_id
+ started_at + completed_at
```

唯一键为 `(creation_task_id, sequence_no)`。没有 `activity_key`、没有持久化 `RUNNING`、没有增量 upsert。产品表不保存逐 Token、真实思维链、Pi JSONL 或 Provider 原始事件；模型下一轮所需的 Tool Call/Result 只存在于会话级 Agent Context。

## 7. Agent Ledger

`agent_worker_executions` 是 TS Worker 的技术账本，不是业务查询来源：

| 字段 | 含义 |
| --- | --- |
| `creation_task_id` | 主键，也是 Agent 执行身份 |
| `state` | `RUNNING / COMPLETION_READY / INTERRUPTED` |
| `completion_json` | Java尚未确认时可重放的最终 Completion |
| `started_at/completed_at/updated_at` | 技术时间戳 |

行为规则：

- 首次消费插入 `RUNNING` 后才开始 Pi Loop。
- 当前进程存在 active 执行时，重复消息直接 ACK，不启动第二个 Loop。
- 重启后发现孤立 `RUNNING`，标记 `INTERRUPTED` 并把 Creation 收敛为 `AGENT_RUNTIME_INTERRUPTED`；不重跑非确定性 Loop。
- Pi 结束后先保存 `COMPLETION_READY + completion_json`（包括成功 Context），再提交 Java。
- Java响应丢失或 MQ 重投时读取 `completion_json` 再次 PUT；Java终态检查保证不重复写消息或 Activity。

普通 Generation 不需要 Worker Ledger；它通过 Java `generation_tasks` 状态、revision、确定性 OSS 对象键、资产唯一约束和 TS active Set 收敛。

## 8. 数据表与接口

核心表：

- `generation_sessions`：跨轮逻辑会话。
- `conversation_messages`：USER/ASSISTANT 最终文本。
- `agent_session_contexts`：每个 Agent 会话唯一的 Pi 压缩摘要与近期完整消息快照。
- `creation_tasks`：一次普通或 Agent 创作轮次；含 `mode/status/revision` 及用户比例、数量约束。
- `generation_tasks`：一次图片模型调用；含 `revision` 和可空 `tool_call_id`。
- `creation_activities`：Agent 最终可展示步骤。
- `agent_worker_executions`：TS Agent 技术账本。
- `image_assets`：永久图片资产。
- `outbox_events`：Java 可靠派发命令和终态通知。

内部接口：

- `GET /internal/generation-worker/agent-creations/{creationId}/execution`
- `PUT /internal/generation-worker/agent-creations/{creationId}/generation-tasks/{toolCallId}`
- `PUT /internal/generation-worker/tasks/{generationTaskId}/phase`
- `PUT /internal/generation-worker/tasks/{generationTaskId}/completion`
- `GET /internal/generation-worker/tasks/{generationTaskId}/completion`
- `PUT /internal/generation-worker/agent-creations/{creationId}/completion`，成功返回 `204`

浏览器接口：

- `POST /agent-creations`
- `POST /agent-creations/{creationId}/cancel`
- `GET /generation-sessions/{sessionId}/turns`
- `GET /events`

对外 ID 均为十进制字符串。统一使用 `creationId`、`generationTaskId`、`toolCallId`、`revision`；请求中的条件版本名为 `expectedRevision`。

## 9. 取消语义

用户取消由 Java锁定并提交 Creation `CANCELLED`，revision 递增。事务提交后 Java广播 `RUN_CANCELLED`，并尽力通过 WebSocket发送 `CANCEL`。TS 对活动 Creation 持有 `AbortController`；取消会触发 Pi `session.abort()`，同一 `AbortSignal` 传入 Tool 和等待器。

`CANCELLED` 只能由 Java用户取消入口产生，TS Agent Completion 只允许 `SUCCEEDED/FAILED`。WebSocket断线恢复后，TS读取一次 Java权威快照；若状态或 revision 已变化，立即中止旧执行。

## 10. 安全边界

- Worker HTTP 与 WebSocket使用内部 Worker Token；Token 不放 URL、不返回浏览器。
- TS 不直接写 Java业务表，只写 `agent_worker_executions` 技术账本；Agent Context 通过 Completion 由 Java事务写入。
- `image_to_image` 继续由 Tool 与 Java双重校验 Asset ID 属于当前 Creation 输入集合；`inspect_image` 由 Java校验当前用户、同一 Generation Session、资产有效性及活动 Creation revision。
- Skill 正文、系统提示词、Tool 原始参数与结果不会作为产品事件发送前端。
- 不向浏览器展示真实思维链；只展示模型主动输出的安全阶段说明。
