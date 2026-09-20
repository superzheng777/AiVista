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
| Agent Worker Ledger | 不写入 | 保存执行防重、暂停 Context 与可重放 Completion |

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
  → 信息不足时可调用 request_user_input；先保存 PAUSE_READY，再由 Java 持久化表单并进入 WAITING_INPUT
Browser
  → 通过 SSE 立即收到完整表单；提交或跳过后由 Java 恢复 RUNNING 并再次派发 AGENT_EXECUTE
TS Agent Worker
  → 从 PAUSE_READY 恢复原 Pi Context，把持久化表单响应作为新的 USER 输入继续同一个 Creation
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

浏览器创建普通任务或 Agent Creation 不再发送 `Idempotency-Key`，前端也不在 `sessionStorage` 保存或自动重放 POST。当前产品在同一会话只允许一个 `RUNNING/WAITING_INPUT` Creation；响应不确定时刷新会话快照即可确认是否已经创建。

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
- 内置 `poster-design`、`brand-design`、`cinematic-still`、`impasto-diorama` 与 `monumental-scale-poster` 分别位于 `backend-ts/.pi/skills/<name>/SKILL.md`。
- Pi 先看到 Skill 的 `name/description/location`，命中后使用受限 `read` 渐进读取正文。
- `read` 保留 Pi 官方 Tool 形态，但执行器只允许规范化后仍位于 `.pi/skills` 根目录内的路径。
- `poster-design` 只承载海报领域方法：任务门禁、不可改写事实、图片路径、视觉原型、Prompt 编译与质量检查。通用回复规范由系统提示词负责，参数和权限由 Tool Schema/Harness 负责，避免规则重复与漂移。
- 海报 Skill 不固定生成四张：同一方向的多个变体使用一次 Tool Call 的 `imageCount`，不同方向才拆分 Tool Call，并服从 Creation 级总数量约束。历史图片可先由 `inspect_image` 理解，但只有本轮明确授权的图片才能进入 `image_to_image`。
- `brand-design` 负责 Logo 与品牌视觉概念：锁定品牌名称和业务事实，提炼定位，选择字标、字母标、图形标或组合标，并把概念编译为图形、字体、色彩与延展原则。它不替代单张活动海报 Skill，也不把生成位图宣称为可编辑矢量源文件、完整 VI 手册或商标检索结论。
- 品牌 Skill 复用同一组 `text_to_image`、`image_to_image` 与 `inspect_image`；不增加专用 Tool、表、接口或权限。Logo 参考图仍遵守本轮 Asset 授权，同一概念的多个变体使用一次 Tool Call，不同品牌概念才拆分调用。
- `cinematic-still` 负责单张真人电影剧照与连续镜头组：先建立事件线与人物、空间、道具、色彩、成像基底的连续性圣经，再从未解决状态、观众位置、视线流量、构图压力和画内光色来源组织独立 Prompt。自由发挥时内部比较三个电影 DNA 后只选一个继续；不同叙事镜头分别调用 Tool，同一镜头的变体才使用一次调用的 `imageCount`。
- 当前生成 Tool 不支持 `21:9`。电影 Skill 在自动画幅下优先 `16:9`，不得传入非法比例或用画内黑边伪造宽银幕；镜头语言库放在 Skill 的 `references/shot-language.md` 中按需读取。
- `impasto-diorama` 负责把当前请求已授权的照片逐张转译为摄影与油彩厚涂立体微景观作品。每张照片独立调用一次 `image_to_image` 且 `imageCount=1`，不增加专用 Tool、表或接口；自动画幅下采用 `3:4` 上下双联，用户画幅硬约束只改变成品容器，不改变照片保真与厚涂转译原则。
- `monumental-scale-poster` 负责“上方巨物压近、中部明亮呼吸带、微小尺度标记、下方透明反射介质”的单画布清透海报。主题缺失时复用 `request_user_input`；画幅与数量继续服从 Creation 约束，不增加专用 Tool、表或接口。
- 显式业务 Tool 为 `text_to_image`、`image_to_image`、`inspect_image` 与 `request_user_input`，使用 Pi `defineTool` 和 TypeBox。
- Harness 校验 Tool 白名单、参数语义、Creation 级比例/数量约束、Asset 授权、20 Turn、超时与 `AbortSignal`。
- Skill 是提示与步骤，不是权限来源；系统规则和 Harness 始终优先。

Tool 无论成功或失败都返回 Pi 官方可消费的 `{ content, details }`。`content` 给模型解释成功结果或可修正错误；`details` 保存 `outcome`、`generationTaskId`、Asset ID 或安全失败码，供 Runtime 投影使用。原始异常、Provider 响应和内部路径不进入模型或浏览器。

同方向多图可由一次 Tool Call 的 `imageCount` 完成；不同设计方向可以产生多个 Tool Call。用户指定比例或数量时，它们作为受信任系统约束注入本轮，Harness 校验模型参数一致；默认 `AUTO/0` 时由模型决定，总图片数量最多 6。

### 4.1 需求确认表单

`request_user_input` 只用于缺少会实质改变结果的信息。V1 只支持固定渲染组件 `TEXT` 与 `SINGLE_SELECT`；字段、选项和模型根据当前理解给出的初始值都由 Tool 参数提供。模型不得把普通说明伪装成表单，也不得在同一次 Tool 批次中混合表单与有副作用的生成 Tool。Harness 会在 Tool 执行前识别这种混合批次，阻止整批调用并把可修正错误返回模型，因此不会仅依赖提示词避免副作用。

表单是 Creation 内独立的业务事实，不伪装成新的聊天气泡或 Activity。`creation_forms` 保存完整定义、`PENDING/SUBMITTED/SKIPPED` 状态及结构化答案；一个 Creation 可按 Loop 需要顺序产生多张表单，但任一时刻最多只有当前 `WAITING_INPUT` 表单可操作。用户可确认或跳过，二者都会持久化并恢复原 Pi Context；跳过会向模型明确表达“按已有信息和合理默认值继续”。

Pi Tool Result 使用官方 `terminate: true` 在表单边界稳定结束当前 prompt。暂停期间不保留活跃 Pi Session、Tool Waiter 或未 ACK 的 MQ 消息；TS Ledger 的 `PAUSE_READY + payload_json` 保存清理过的 Pi Context 和原始表单请求。用户响应后，Java复用 `AGENT_EXECUTE` Outbox 派发新 revision，TS恢复 Context继续执行，不新增队列或恢复协议。

## 5. 会话与 Agent Context

Java Execution Snapshot V3 返回当前 USER prompt、当前会话唯一的 `agentContext`、本轮授权图片、Creation 级生成约束，以及恢复执行时最新一张已处理表单的响应。普通模式不读取或修改 Agent Context；上下文严格以 Generation Session 隔离。

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
- Java 提交的 `FORM_REQUESTED / FORM_RESOLVED`
- Java 提交的 `RUN_FINISHED / RUN_FAILED / RUN_CANCELLED`

TS 将安全事件通过一个实例级 WebSocket发送给 Java；Java验证 Creation 所有权、模式、状态与 revision，补齐用户和会话路由，再通过用户级 SSE 发给浏览器。前端直接消费 `TEXT_DELTA`，不伪造逐字符输出。

中间 Activity 不写数据库，也没有 Activity HTTP 接口。Java 的内存投影会聚合文字、Skill 和 Tool 状态；浏览器 SSE 新建或重连时收到 `RUN_SNAPSHOT`，以 `streamId + sequence` 恢复当前安全过程。表单不是瞬时 Activity：事务提交后，Java 通过 SSE 直接发送完整 `FORM_REQUESTED/FORM_RESOLVED` 快照，前端无需为每个表单事件再次 GET；页面刷新或 SSE 重连时再由 Turn REST 恢复。最终状态仍由 REST 快照兜底。

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
| `execution_revision` | 当前执行分段对应的 Creation revision |
| `state` | `RUNNING / PAUSE_READY / COMPLETION_READY / INTERRUPTED` |
| `payload_json` | `PAUSE_READY` 的 Pi Context/表单请求，或 Java尚未确认的最终 Completion |
| `started_at/completed_at/updated_at` | 技术时间戳 |

行为规则：

- 首次消费插入 `RUNNING` 后才开始 Pi Loop。
- 当前进程存在同 revision 或更新 revision 的 active 执行时，重复/过期消息直接 ACK；更高 revision 的恢复命令等待上一执行分段退出后再启动，不能被误判成重复消息。
- 重启后发现孤立 `RUNNING`，标记 `INTERRUPTED` 并把 Creation 收敛为 `AGENT_RUNTIME_INTERRUPTED`；不重跑非确定性 Loop。
- Pi 请求用户输入时先保存 `PAUSE_READY + payload_json`，再幂等创建 Java 表单；MQ 重投可重放同一表单请求。
- 表单处理后，新 revision 的 `AGENT_EXECUTE` 将 `PAUSE_READY` 原子恢复为 `RUNNING`，并从保存的 Pi Context 继续。
- Pi 结束后先保存 `COMPLETION_READY + payload_json`（包括成功 Context），再提交 Java。
- Java响应丢失或 MQ 重投时读取 `payload_json` 再次 PUT；Java终态检查保证不重复写消息或 Activity。

普通 Generation 不需要 Worker Ledger；它通过 Java `generation_tasks` 状态、revision、确定性 OSS 对象键、资产唯一约束和 TS active Set 收敛。

## 8. 数据表与接口

核心表：

- `generation_sessions`：跨轮逻辑会话。
- `conversation_messages`：USER/ASSISTANT 最终文本。
- `agent_session_contexts`：每个 Agent 会话唯一的 Pi 压缩摘要与近期完整消息快照。
- `creation_tasks`：一次普通或 Agent 创作轮次；含 `mode/status/revision` 及用户比例、数量约束。
- `generation_tasks`：一次图片模型调用；含 `revision` 和可空 `tool_call_id`。
- `creation_activities`：Agent 最终可展示步骤。
- `creation_forms`：Agent 请求的完整表单定义、处理状态和结构化答案。
- `agent_worker_executions`：TS Agent 技术账本。
- `image_assets`：永久图片资产。
- `outbox_events`：Java 可靠派发命令和终态通知。

内部接口：

- `GET /internal/generation-worker/agent-creations/{creationId}/execution`
- `PUT /internal/generation-worker/agent-creations/{creationId}/forms/{toolCallId}`
- `PUT /internal/generation-worker/agent-creations/{creationId}/generation-tasks/{toolCallId}`
- `PUT /internal/generation-worker/tasks/{generationTaskId}/phase`
- `PUT /internal/generation-worker/tasks/{generationTaskId}/completion`
- `GET /internal/generation-worker/tasks/{generationTaskId}/completion`
- `PUT /internal/generation-worker/agent-creations/{creationId}/completion`，成功返回 `204`

浏览器接口：

- `POST /agent-creations`
- `PUT /agent-creations/{creationId}/forms/{formId}/response`
- `POST /agent-creations/{creationId}/cancel`
- `GET /generation-sessions/{sessionId}/turns`
- `GET /events`

对外 ID 均为十进制字符串。统一使用 `creationId`、`generationTaskId`、`toolCallId`、`revision`；请求中的条件版本名为 `expectedRevision`。

## 9. 取消语义

用户可在 `RUNNING` 或 `WAITING_INPUT` 时取消。Java锁定并提交 Creation `CANCELLED`，revision 递增。事务提交后 Java广播 `RUN_CANCELLED`，并尽力通过 WebSocket发送 `CANCEL`。TS 对活动 Creation 持有 `AbortController`；取消会触发 Pi `session.abort()`，同一 `AbortSignal` 传入 Tool 和等待器；等待表单时没有活跃 Pi Session，Java状态本身即可终止后续恢复。

`CANCELLED` 只能由 Java用户取消入口产生，TS Agent Completion 只允许 `SUCCEEDED/FAILED`。WebSocket断线恢复后，TS读取一次 Java权威快照；若状态或 revision 已变化，立即中止旧执行。

## 10. 安全边界

- Worker HTTP 与 WebSocket使用内部 Worker Token；Token 不放 URL、不返回浏览器。
- TS 不直接写 Java业务表，只写 `agent_worker_executions` 技术账本；Agent Context 通过 Completion 由 Java事务写入。
- `image_to_image` 继续由 Tool 与 Java双重校验 Asset ID 属于当前 Creation 输入集合；`inspect_image` 由 Java校验当前用户、同一 Generation Session、资产有效性及活动 Creation revision。
- Skill 正文、系统提示词、Tool 原始参数与结果不会作为产品事件发送前端。
- `request_user_input` 的定义和答案都经过 TypeBox、Zod 与 Java信任边界校验；前端只渲染固定字段类型，不接受模型提供的 HTML 或组件代码。
- 不向浏览器展示真实思维链；只展示模型主动输出的安全阶段说明。
