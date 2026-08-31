# AiVista Agent 模式模块

> 对应迭代：待排期——Agent 模式
> 当前状态：设计中
> 维护规则：本文贯穿 Agent 模式的设计、实施与验收；代码、测试、消息契约、Skill、Tool 和文档必须同步修改。

## 1. 目标与范围

### 1.1 首期目标

基于现有会话、创作轮次、消息、图像生成任务、RabbitMQ、Outbox、OSS 转存、图片资产和 SSE 能力，新增独立 TypeScript Agent 服务，跑通以下完整链路：

```text
用户进入 Agent 模式并提交请求
  → 创建 Agent Run 并可靠投递
  → 实时展示可解释执行阶段
  → 识别请求意图
  → 用户手动选择或 Agent 自动选择 Skill
  → Skill 驱动模型与受控 Tool 协作
  → 通过现有图像任务入口提交生成
  → 等待 RabbitMQ 异步生成与 OSS 转存
  → 图片保存为现有资产
  → 事件唤醒 Agent 完成最终回复
  → 前端展示执行过程、最终消息和图片
```

首期计划内置一至两个内部 Skill，优先候选为：

- `image-create`：未命中垂类 Skill 时使用的通用文生图 Skill。
- `poster-design`：处理海报用途、视觉层级、主体布局和文字留白的垂类 Skill。

### 1.2 首期范围

- Agent 模式请求入口与状态查询。
- 独立 TypeScript Agent Service 和 RabbitMQ 消费者。
- 有限的意图分类、手动 Skill 选择与自动 Skill 路由。
- 内部版本化 Skill 注册、加载和工具白名单。
- 结构化模型动作与模型—工具执行循环。
- 复用现有文生图任务、MQ、转存和资产链路。
- `WAITING_TOOL` 异步等待、事件恢复和重复消息处理。
- 持久化 Agent 执行事件及 SSE 实时展示。
- 一条最终助手消息和多个执行事件、图片资产的回合聚合展示。
- 最小结构化会话记忆；是否在首期启用待确认。

### 1.3 首期不包含

- 用户创建、上传、在线编辑或公开发布 Skill。
- Skill 市场和第三方 Skill。
- 多 Agent、子 Agent 或长时间自主后台工作。
- 默认不在首期主链引入向量数据库；模糊历史图片语义检索是否作为首期后续小步纳入仍待确认。
- 自动视觉质检、手部或文字缺陷修复。
- 超分、抠图、扩图、局部重绘等尚未完成的原子能力。
- 自动算力降级和复杂供应商路由。
- 视频、音乐和项目打包交付。
- 把模型原始思维链展示给用户。

## 2. 已确认约束

### 2.1 产品与 Skill

- 首期 Skill 由项目内部维护并随 Agent 服务发布，对外只允许用户引用，不开放创建和修改。
- 用户可以显式选择 Skill，也可以不选择并由 Agent 自动匹配。
- 用户显式选择且满足权限、输入和能力要求的 Skill 优先于自动路由。
- 未命中垂类图片 Skill 时使用默认 `image-create`，不在 Runtime 中另写一套普通文生图业务分支。
- Skill 以自然语言工作流指令为主体，并带有可执行 Manifest、允许工具列表、触发摘要、版本和定义哈希。
- 不同 Skill 可以具有不同步骤、工具调用次数、调用时机、用户确认点和交付要求。
- Skill 负责创作策略；Runtime 强制工具权限、参数约束、状态转换、幂等、等待恢复和可确定验证的验收项。

### 2.2 服务与数据边界

- 现有 Java 主服务继续拥有用户、会话、消息、额度、图像任务、图片资产、OSS 和对外 API。
- 新 TypeScript Agent Service 负责意图识别、Skill 路由、上下文构造、模型—工具循环及 Agent 恢复。
- Agent 不得绕过现有内部图像任务入口直接调用图像供应商、扣额度、操作 OSS 或创建图片资产。
- MySQL 是 Agent Run 和图像任务的唯一状态真相源；RabbitMQ 只传递最小执行命令。
- RabbitMQ 消息只包含事件 ID、Run ID、Run 版本、唤醒原因和必要的 Tool Call ID，不包含完整对话、Skill 正文或生产 Prompt。
- 图片只有完成 OSS 转存并形成可见 `image_assets` 记录后，才算可交付结果。

### 2.3 用户可见执行过程

- 前端展示结构化阶段、简短决策摘要、Skill 选择、工具进度和最终产物，不展示模型原始思维链、系统提示词或内部上下文。
- 一个 Agent 创作轮次保留一条 USER 消息和一条最终 ASSISTANT 消息。
- 意图识别、Skill 激活、生成进度和等待状态写入 Agent 执行事件，不写成普通会话消息。
- 前端以 `creation_task` 为回合边界，聚合 USER 消息、Agent Run、执行事件、最终 ASSISTANT 消息和图片资产。
- SSE 只承担实时增量；页面刷新和断线恢复必须能够从持久化数据重新构建回合。

### 2.4 记忆

- 当前最重要的记忆能力是把用户对历史图片的自然语言指代解析为真实 `assetId`，支持“把刚才第三张改亮”和“修改之前那张蓝头发拿剑的角色图”等请求。
- 资产引用按“前端显式 `assetId` → 最近回合、序号和版本等确定性指代 → 用户命名或标签精确匹配 → 向量语义检索”的顺序解析，不对“刚才、第三张、上一版”等明确指代优先使用向量近似搜索。
- MySQL 继续保存资产真实身份、用户归属、回合顺序、创意方向和派生关系；向量数据库只保存或索引图片语义描述与 `assetId` 引用，不能作为图片资产真相源。
- 向量检索返回候选 `assetId` 后必须回查 MySQL，重新校验用户归属、可见状态、删除状态及是否可作为当前操作输入。
- 多个语义候选接近时不得擅自选图，应展示候选并通过 `WAITING_USER` 让用户确认。
- 首期 Agent 主链先实现显式资产、最近回合、图片序号和创意方向等确定性引用；是否把模糊历史图片语义检索和向量数据库纳入首期仍待确认。
- 默认比例、品牌色、禁止元素等权威参数如后续需要，仍使用结构化关系数据；它们不应仅保存为向量。

## 3. 关键决策记录

| 决策事项 | 最终结论 | 原因与取舍 | 对实现的影响 |
| --- | --- | --- | --- |
| Agent 服务语言与部署 | 新增独立 TypeScript Agent Service，保留 Java 主服务 | 模型、Skill 和 Tool 编排适合 TS 生态；现有可靠生成和业务资产能力无需重写 | 新增一个部署单元和 Agent MQ 消费者 |
| Agent 与图像服务边界 | Agent 通过 Java 内部 Tool API 创建和读取生成任务 | 防止两套语言重复实现额度、权限、幂等和资产规则 | TS 不直接写 `generation_tasks`、`image_assets` |
| 普通文生图 | 使用默认内部 `image-create` Skill | 统一垂类和通用创作的执行机制，避免 Runtime 业务分支膨胀 | 图片创作都经 Skill Runtime，聊天/查询/控制除外 |
| Skill 形态 | `manifest.json + SKILL.md`，随代码版本化发布 | 贴合自然语言 Skill 与工具约束的目标，首期无需在线 DSL 或管理后台 | Run 固定保存 Skill ID、版本和定义哈希 |
| 工具权限 | Manifest 声明，Runtime 强制白名单 | 自然语言禁止规则不能提供可靠权限隔离 | 未授权工具调用必须在执行前拒绝 |
| Runtime 形态 | 有限状态、有限动作、Tool Registry 和模型—工具循环 | 控制面可测试，创作经验仍可由 Skill 扩展 | 不按 Skill ID 编写大型 `if/else` 流程 |
| 异步等待 | 提交生成后持久化为 `WAITING_TOOL` 并 ACK；生成终态事件重新唤醒 | 避免持有 MQ Delivery、进程内 Promise 或主动高频轮询 | Java 需在生成终态事务中创建 Agent Resume Outbox |
| 用户等待 | 首期实现 `WAITING_USER`，仅在 Skill 工作流或系统确定性预检实际要求用户输入时进入 | Runtime 具备暂停恢复能力，但不让模型无依据追问 | 持久化等待原因和表单，用户提交后由 Resume Outbox 唤醒 |
| Agent 前端过程 | 展示持久化结构化事件，不展示原始思维链 | 同时满足可解释进度、隐私、安全和可恢复要求 | 新增 Agent 事件协议与聚合查询 |
| 会话消息语义 | 每轮一条最终 ASSISTANT 消息，阶段信息独立存储 | 避免将进度噪声带入后续模型上下文 | 现有每轮每角色唯一约束可以继续保留 |
| 首期资产引用 | 优先支持显式 `assetId`、最近回合、序号和创意方向的确定性解析 | “刚才第三张”存在精确关系，不应使用近似向量搜索 | 保存 Run、Tool Call、任务、资产、`variant_no` 和 `variant_name` 关系 |
| 向量资产记忆定位 | 用于根据模糊自然语言描述召回历史图片候选，返回 `assetId` 引用 | 支持“之前那张蓝头发拿剑的图”，但不能代替权限和资产真相校验 | 后续或首期独立小步增加资产语义描述、Embedding、向量检索、重排和候选确认，具体范围待确认 |
| LLM 供应商 | 采用阿里云体系，具体模型和运行参数待验证后确认 | 与现有生成供应商环境一致，但 Runtime 不绑定具体 SDK 或模型 | 通过 `AgentModelProvider` 适配，Run 保存实际供应商与模型快照 |
| 多张图片的首期策略 | 待确认 | 一次任务返回多图实现简单；多创意 Prompt 需要一轮关联多个生成任务 | 影响现有唯一约束、额度、进度汇总和 Tool 关联模型 |

## 4. 实施计划与进度

| 小步目标 | 状态 | 完成内容或当前阻塞 | 验证方式/结果 |
| --- | --- | --- | --- |
| 1. 设计收敛 | 进行中 | 已明确服务边界、Skill/Tool/Runtime 关系、异步恢复和前端事件模型；数据归属、多任务关系和首期图生图仍待确认 | 本文评审通过后进入实施中 |
| 2. Agent 后端骨架 | 待开始 | Agent 表、状态机、Outbox、MQ 拓扑、TS Consumer 和处理租约 | 重复投递、并发领取和崩溃恢复自动化测试 |
| 3. 通用文生图闭环 | 待开始 | 意图识别、`image-create`、`generation.create`、异步恢复、最终消息和资产展示 | 真实环境端到端生成验收 |
| 4. Skill 路由证明 | 待开始 | `poster-design`、用户手动选择、自动选择、不同指令和交付行为 | 路由、工具白名单和 Skill 版本测试 |
| 5. 前端实时过程 | 待开始 | Agent SSE、事件重放、回合聚合和图片网格 | 断线重连、刷新恢复和终态快照验收 |
| 6. 可靠性收敛 | 待开始 | 取消、超时、模型格式错误、图像失败、转存失败和重复完成 | 故障注入与端到端回归 |
| 7. 资产引用与语义记忆 | 待开始 | 首期先实现显式及最近回合确定性引用；向量资产检索是否纳入首期待确认 | 序号定位、模糊描述候选、权限回查和歧义确认测试 |

## 5. 设计与实现

### 5.1 分层架构

```text
Web 前端
  Agent 模式入口 / Skill 手动选择 / SSE 时间线 / 表单 / 图片网格
        │ HTTP + SSE
        ▼
Java 主服务
  Agent API / 会话消息 / Tool API / 额度幂等 / Generation / Asset / SSE
        │                              │
        │ RabbitMQ                     │ MySQL
        ▼                              ▼
TypeScript Agent Service          Agent、会话、任务、资产和 Outbox 数据
  Consumer / Intent Router / Skill Registry / Runtime / Tool Adapters / LLM Client
        │
        └─ 通过 Java Tool API 创建图像任务
```

### 5.2 请求、目标与 Skill 分层

请求类型、生成操作和垂类 Skill 是三个不同维度：

```text
请求类型：CHAT / CREATE / EDIT / QUERY / CONTROL / UNSUPPORTED
目标媒介：IMAGE / TEXT / NONE
生成操作：TEXT_TO_IMAGE / IMAGE_TO_IMAGE
垂类 Skill：image-create / poster-design / 后续其他内部 Skill
```

首期建议路由：

| 用户请求 | 请求分类 | Skill |
| --- | --- | --- |
| 普通聊天 | `CHAT` | 无 |
| 查询图片任务 | `QUERY` | 无 |
| 取消任务 | `CONTROL` | 无 |
| 普通文生图 | `CREATE + IMAGE + TEXT_TO_IMAGE` | 默认 `image-create` |
| 海报设计 | `CREATE + IMAGE + TEXT_TO_IMAGE` | 自动或手动 `poster-design` |
| 图片修改 | `EDIT + IMAGE + IMAGE_TO_IMAGE` | 首期是否支持待确认 |

用户显式 Skill、自动 Skill 与默认 Skill 的优先级为：

```text
用户显式选择且校验通过
  > 自动匹配的垂类 Skill
  > 当前请求类型对应的默认 Skill
```

### 5.3 Skill 定义

建议目录：

```text
agent-service/src/skills/definitions/
  image-create/
    manifest.json
    SKILL.md
  poster-design/
    manifest.json
    SKILL.md
```

Manifest 至少包含：

```ts
interface SkillManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  enabled: boolean;
  userInvocable: boolean;
  autoInvocable: boolean;
  triggerSummary: string;
  inputModalities: Array<"TEXT" | "IMAGE">;
  outputModalities: Array<"TEXT" | "IMAGE">;
  allowedTools: string[];
  allowedChildSkills: string[];
  maxIterations: number;
  definitionHash: string;
}
```

`SKILL.md` 包含触发边界、执行步骤、工具调用规则、参数默认值、用户确认点、禁止事项、验收和输出规范。Skill 中的步骤是给模型的创作工作流；涉及权限、额度、状态、资产归属和幂等的约束由代码强制。

### 5.4 Runtime

Runtime 不按垂类 Skill 编写大型分支，只识别有限模型动作：

```ts
type AgentAction =
  | { type: "TOOL_CALL"; tool: string; callId: string; arguments: unknown }
  | { type: "ASK_USER"; form: FormRequest }
  | { type: "FINAL"; result: AgentFinalResult }
  | { type: "REJECT"; code: string; message: string };
```

执行循环：

```text
读取并领取 Run
  → 构造当前输入、最近对话、关联资产和相关记忆
  → 分类请求并选择 Skill
  → 加载固定版本 Skill 和允许工具
  → LLM 返回下一结构化动作
  → Runtime 校验动作、工具白名单和参数
  → 执行 Tool 并记录结果
  → 同步结果继续循环，异步结果进入等待，最终结果完成 Run
```

### 5.5 Tool

首期候选 Tool：

| Tool | 职责 | 备注 |
| --- | --- | --- |
| `generation.create` | 通过 Java 内部 API 创建现有图像生成任务 | 异步返回 Tool Call 和任务引用 |
| `generation.getResult` | 在恢复后读取已终态且已转存的资产 | 不用于主动高频轮询 |
| `asset.getMetadata` | 获取当前用户输入资产的安全元数据 | 不返回 OSS Key 或长期 URL |
| `ui.requestInformation` | 请求结构化用户输入并进入 `WAITING_USER` | 首期实现；仅在 Skill 或确定性预检需要时调用 |
| `ui.presentAssets` | 生成语义化资产展示结果 | 签名 URL 仍由 Java 产生 |
| `memory.proposePatch` | 产生待提交的结构化记忆变更 | 首期是否实现待确认 |

Tool 统一返回结构化成功或错误，不向模型暴露内部异常正文。自动重试必须按 Tool 声明的 `NONE`、`SAFE_IDEMPOTENT`、`STATUS_CHECK_FIRST` 或 `MANUAL_RETRY` 策略执行；生成请求超时不得无条件重提。

### 5.6 端到端链路

```text
1. 前端提交 Agent 请求。
2. Java 在事务中创建 creation_task、USER 消息、agent_run 和 Agent Outbox。
3. Outbox 向 Agent 命令队列投递最小消息。
4. TS Consumer 通过 Run ID 和版本条件领取。
5. TS 持久化并推送 UNDERSTANDING、INTENT_IDENTIFIED 等事件。
6. 用户显式选择 Skill 时优先校验并使用，否则自动路由，最后回落默认 Skill。
7. Runtime 加载 Skill 正文，只向模型暴露 Manifest 允许的 Tool。
8. 模型产生 generation.create 调用，Runtime 校验后通过 Java Tool API 提交。
9. Java 在现有事务中创建 generation_task、额度记录和生成 Outbox。
10. Agent Run 进入 WAITING_TOOL，Agent MQ 消息 ACK。
11. 现有生成和转存消费者完成供应商调用、OSS 转存及 image_assets 落库。
12. Java 在生成任务终态事务中创建 Agent Resume Outbox。
13. TS 收到恢复消息，读取已保存资产并完成 Skill 的确定性验收。
14. 模型生成最终用户回复。
15. Java 原子写入最终 ASSISTANT 消息、Run 终态和最终事件。
16. 前端通过 SSE 增量更新，并在刷新时通过聚合查询还原完整 Agent 回合。
```

### 5.7 前端 Agent 回合

一个 Agent 回合由以下信息聚合渲染：

```text
AgentTurn
  ├─ UserMessage
  ├─ AgentRunHeader：执行中 / 等待 / 已完成 / 失败
  ├─ AgentTimeline
  │    ├─ 意图识别摘要
  │    ├─ Skill 选择
  │    ├─ 计划摘要
  │    └─ 生成和保存进度
  ├─ AssistantFinalMessage
  └─ AssetGallery
```

生成前的自然语言计划说明作为 `PLAN_SUMMARY` 事件，而不是提前创建正式 ASSISTANT 消息。最终 ASSISTANT 消息只保存用户未来继续对话所需的结果总结。

### 5.8 多任务关系

一个 `creation_task` 表示一次用户创作请求，一个 `agent_run` 表示完成该请求的一次 Agent 执行，一个 `generation_task` 表示一次实际图像生成任务，一个 `image_asset` 表示已保存结果。

一次生成任务返回四张变体：

```text
creation_task
  └─ agent_run
       └─ generation_task（一个 Prompt，requested_image_count = 4）
            ├─ image_asset
            ├─ image_asset
            ├─ image_asset
            └─ image_asset
```

四个独立创意方向：

```text
creation_task
  └─ agent_run
       ├─ generation_task：夏日活力
       ├─ generation_task：潮酷霓虹
       ├─ generation_task：冰爽解暑
       └─ generation_task：复古经典
```

前者实现简单但共享一个 Prompt；后者支持独立 Prompt、重试和进度，但需要解除当前 `generation_tasks.creation_task_id` 唯一约束，并增加 Agent Tool Call 与多个生成任务的关联。

### 5.9 记忆演进

Agent 记忆按用途分为四类：

| 类型 | 解决的问题 | 推荐实现 |
| --- | --- | --- |
| 会话资产引用记忆 | “刚才第三张”“上一版”“最后一张” | MySQL 中 Run、Tool Call、任务、资产顺序和创意方向关系 |
| 资产语义记忆 | “之前那张蓝头发拿剑、站在雨里的角色图” | 图片语义描述、标签、Embedding 和向量检索 |
| 资产派生记忆 | “回到改亮之前那版” | MySQL 资产派生关系 |
| 项目知识记忆 | 角色设定、品牌约束、默认风格和长期反馈 | 后续项目实体、结构化权威值与向量检索组合 |

资产引用解析器按确定性优先、语义检索兜底执行：

```ts
interface AssetReferenceResolver {
  resolve(query: AssetReferenceQuery): Promise<AssetReferenceResolution>;
}
```

解析顺序：

```text
1. 请求或前端已提供 assetId：回查 MySQL 并直接使用。
2. 解析最近 Run、图片序号、上一版、最后一张和 variantName。
3. 匹配用户命名和结构化标签。
4. 仍无法定位时，对图片语义描述执行向量检索并重排候选。
5. 第一候选不具有足够区分度时进入 WAITING_USER，让用户从候选图片中选择。
```

首期每张生成图片至少保留生成上下文、最终 Prompt、Skill、创意方向、图片序号和真实 `assetId`，用于构造初始语义描述。后续可通过视觉模型按图片实际内容生成 Caption、主体、场景、风格和颜色等语义资料，再生成 Embedding。Prompt 描述不能被视为图片实际内容的可靠证明。

向量库只负责找“哪些图片可能符合用户描述”。最终资产读取和图生图输入仍回到 MySQL 与 Java Tool API 完成权限和状态校验。

## 6. 数据模型与配置

以下为设计草案，表名、字段和所有权尚未完成设计准入。

### 6.1 `agent_runs`

```text
id
user_id
session_id
creation_task_id
status
run_version
request_kind
target_modality
operation
scenario
active_skill_id
active_skill_version
active_skill_hash
model
iteration_count
waiting_reason
waiting_tool_call_id
failure_code
failure_message
started_at
completed_at
created_at
updated_at
```

建议状态：

```text
QUEUED → RUNNING → WAITING_TOOL → RUNNING → SUCCEEDED / FAILED / CANCELLED
                 → WAITING_USER → QUEUED 或 RUNNING
```

首期实现 `WAITING_USER`。只有 Skill 工作流返回受允许的 `ASK_USER` 动作，或 Runtime/Tool 的确定性预检无法在无用户选择的情况下继续时才进入；没有触发条件的 Skill 不使用该状态。

### 6.2 `agent_run_events`

```text
id
agent_run_id
sequence_no
event_type
stage
title
detail
payload_json
created_at
UNIQUE (agent_run_id, sequence_no)
```

候选阶段：

```text
QUEUED
UNDERSTANDING
INTENT_IDENTIFIED
SKILL_ROUTING
SKILL_SELECTED
PLAN_READY
PROMPT_PREPARING
PRECHECKING
GENERATION_SUBMITTED
GENERATION_RUNNING
GENERATION_PROGRESS
ASSET_SAVING
RESULT_PREPARING
COMPLETED
FAILED
CANCELLED
```

### 6.3 `agent_tool_calls`

```text
id
agent_run_id
call_id
tool_name
status
idempotency_key
input_json
output_json
failure_code
started_at
completed_at
created_at
updated_at
UNIQUE (agent_run_id, call_id)
UNIQUE (idempotency_key)
```

如果一条 Tool Call 可以批量创建多个生成任务，使用关联表而不是单个 `linked_generation_task_id`：

```text
agent_tool_call_generation_tasks
  agent_tool_call_id
  generation_task_id
  variant_no
  variant_name
  created_at
```

### 6.4 资产语义资料与派生关系

图片的真实记录继续使用现有 `image_assets`。为语义检索增加的关系数据候选为：

```text
asset_semantic_profiles
  asset_id
  user_id
  session_id
  source_type
  caption
  labels_json
  subjects_json
  scene
  style_json
  colors_json
  variant_name
  embedding_status
  embedding_version
  caption_model
  created_at
  updated_at

asset_derivations
  source_asset_id
  derived_asset_id
  relation_type
  agent_run_id
  agent_tool_call_id
  created_at
```

语义资料来源候选：

```text
GENERATION_CONTEXT
VISION_MODEL
USER_CONFIRMED
```

用户确认的名称或描述优先于视觉模型，视觉模型结果优先于仅由生成上下文推导的描述。向量索引保存 `asset_id`、作用域和 Embedding 版本等最小元数据，不保存 OSS Key、长期 URL 或资产权限真相。

如果后续需要权威项目偏好，再单独增加结构化记忆：

```text
conversation_memories 或 project_memories
  id
  scope_type
  scope_id
  memory_key
  value_json
  source_type
  status
  version
  created_at
  updated_at
```

当前尚未确认独立 `projects` 实体，不提前创建 `project_memories`。

### 6.5 MQ

候选拓扑：

```text
Exchange: aivista.agent.commands
Queue: agent.run.execute
Routing Key: agent.run.execute
```

启动和恢复可使用同一队列，通过 `reason` 区分：

```ts
type AgentRunReason = "START" | "TOOL_COMPLETED" | "USER_CONTINUED" | "RETRY";
```

命令至少包含：

```text
schemaVersion
eventId
runId
runVersion
reason
toolCallId（按原因可选）
```

### 6.6 配置

后续需确认：

- Agent MQ 开关、Exchange、Queue、Routing Key、prefetch 和并发数。
- Agent Run 执行租约、最大迭代次数、模型超时和安全重试次数。
- 阿里云 LLM 的具体模型标识、结构化输出能力、密钥配置方式、超时和预算上限。
- Java 内部 Tool API 基址和服务间认证。
- Skill 定义目录、启动校验和启用列表。
- SSE 事件保留、重放上限和清理策略。

## 7. API 与权限

接口仍为草案，需在下一轮详细设计确认。

### 7.1 对外 API

| 方法 | 路径 | 职责 |
| --- | --- | --- |
| `POST` | `/api/agent-runs` | 创建 Agent Run，支持可选 `skillId` 和输入资产 |
| `GET` | `/api/agent-runs/{runId}` | 查询 Run、当前阶段、Skill、最终消息和资产快照 |
| `GET` | `/api/agent-runs/{runId}/events` | SSE 实时事件与 `Last-Event-ID` 恢复 |
| `POST` | `/api/agent-runs/{runId}/cancellations` | 请求取消；是否改用现有项目统一动作风格待确认 |

创建请求必须带幂等键。所有接口按当前登录用户校验 Run、会话和输入资产归属。

### 7.2 Java 内部 Tool API

| 方法 | 候选路径 | 职责 |
| --- | --- | --- |
| `POST` | `/internal/agent-tools/generation-tasks` | 校验权限、额度和参数并创建生成任务 |
| `GET` | `/internal/agent-tools/generation-tasks/{taskId}` | 读取终态和安全资产结果 |
| `POST` | `/internal/agent-runs/{runId}/events` | 持久化 Agent 用户可见事件 |
| `POST` | `/internal/agent-runs/{runId}/completions` | 原子写最终消息和 Run 终态 |
| `POST` | `/internal/agent-runs/{runId}/failures` | 以稳定错误码收敛失败 Run |

内部 API 必须使用服务身份认证，且仍校验 Run 与业务对象的关联；不能仅因调用方位于内网就信任其传入的用户 ID、资产 ID 或任务 ID。

### 7.3 响应与错误

- 沿用项目统一响应 Envelope，不向用户或模型暴露数据库、MQ、供应商或 OSS 原始异常。
- Tool 错误至少包含稳定 `code`、是否可重试、是否需要用户操作和安全展示信息。
- 参数错误、状态冲突、额度不足、权限拒绝、供应商结果未知和资产转存失败必须使用不同错误码。

## 8. 异常场景、可靠性与安全

### 8.1 可靠性

- Run 使用 `status + run_version` 条件领取，旧版本和重复 MQ 消息安全 ACK。
- Agent 创建和启动 Outbox 必须同事务；生成任务终态和 Resume Outbox 必须同事务。
- Agent 消费者不得在等待图像生成或用户输入期间持有 MQ Delivery。
- `generation.create` 必须使用稳定幂等键；网络超时不代表供应商未接收，不得无条件重复提交。
- `RUNNING` 处理租约到期后的恢复规则待确认；必须区分模型调用前、Tool 副作用前后和结果未知状态。
- 最终 ASSISTANT 消息和 Run 终态必须幂等，重复恢复不得创建第二条最终消息。
- Agent SSE 事件持久化并使用单调 `sequence_no`；断线重连按 `Last-Event-ID` 或聚合查询恢复。

### 8.2 安全

- 模型只获得当前 Skill 允许工具的说明，Runtime 在调用前再次校验。
- Tool API 强制校验用户、会话、Run、任务和资产归属。
- 不向模型、事件、日志和文档写入密钥、OSS Key、长期 URL、完整供应商响应或系统提示词。
- Tool 返回、历史消息、参考文档和图片识别文本均视为不可信内容，不能改变系统权限和工具白名单。
- 取消后的 Run 不得继续产生新的 Tool 副作用。
- 用户可见“思考”只能是结构化阶段和安全摘要，不展示隐藏推理过程。

### 8.3 失败收敛

至少区分：

```text
INTENT_OUTPUT_INVALID
SKILL_NOT_FOUND
SKILL_NOT_ALLOWED
TOOL_NOT_ALLOWED
TOOL_ARGUMENT_INVALID
AGENT_ITERATION_LIMIT
GENERATION_REJECTED
GENERATION_FAILED
GENERATION_OUTCOME_UNKNOWN
ASSET_TRANSFER_FAILED
RUN_CANCELLED
```

Skill 的语义验收不能替代代码能够确定的技术验收。首期若没有视觉模型，只承诺任务、数量、归属、尺寸和资产保存等技术验收，不宣称自动识别或修复视觉缺陷。

## 9. 测试与验收

### 9.1 自动化测试

- 意图结构化输出校验及非法输出修复或失败。
- 用户显式 Skill 优先级、自动 Skill 匹配和默认 Skill 回落。
- Skill 禁用、输入不匹配、工具越权和参数非法。
- Run 状态机、版本条件领取和非法状态转换。
- Agent MQ、Resume MQ 重复投递。
- Tool Call 幂等及相同调用不重复创建图像任务。
- 图像成功、部分成功、失败、转存失败和结果未知。
- Agent Consumer 在 `RUNNING`、`WAITING_TOOL` 等阶段停止后的恢复。
- 最终消息、完成事件和资产关联不重复。
- SSE 顺序、补发、断线重连和页面刷新聚合结果。
- 当前请求与旧记忆冲突时当前请求优先。

### 9.2 人工/真实环境验收

正常链路：

```text
用户提交普通文生图
  → 自动回落 image-create
  → 前端实时展示阶段
  → 图片生成并转存
  → Agent 恢复并写最终消息
  → 页面展示图片
```

Skill 链路：

```text
用户显式或自动选择 poster-design
  → 展示 Skill 选择和安全理由
  → 使用不同于通用生图的工作流指令
  → 生成并展示海报视觉底图
```

真实环境还需验证：重复提交、取消、服务重启、MQ 重投、SSE 断线、图片生成失败和转存失败。

### 9.3 首期完成标准

- Java、TS、RabbitMQ、MySQL、供应商、OSS 和前端链路完整运行。
- 普通文生图和至少一个垂类 Skill 的行为差异可观察且可测试。
- 用户能实时看到意图、Skill、生成和保存阶段，但看不到原始思维链。
- 图片进入现有资产库并可从 Agent 回合稳定恢复展示。
- 重复 MQ 和页面刷新不会产生重复任务、消息或资产。
- 已记录未覆盖能力，不以未经验证的质量提升数字作为验收结论。

## 10. 后续边界

- 建立独立 `projects`、项目资产和项目级结构化记忆。
- 增加图片 Caption、标签、Embedding 和向量数据库，支持根据模糊自然语言描述检索历史 `assetId`。
- 增加向量候选重排、置信差判断和候选图片确认交互；向量结果始终回查 MySQL 权限与状态。
- 在结构化权威值、资产谱系与向量召回之间建立来源、版本、冲突和过期规则。
- 扩展图生图、局部重绘、超分、抠图、扩图和元素替换 Tool。
- 增加视觉质检 Tool 和有评测基准的自动修复闭环。
- 支持一轮多个不同 Prompt 的生成任务、独立重试和部分结果展示。
- 增加更多内部 Skill，再评估在线发布、用户自定义和 Skill 审核体系。
- 扩展视频、音频等多模态能力；新增能力仍通过稳定 Tool Contract 和 Skill 接入。

### 10.1 进入实施前待确认

1. 首期只支持 `TEXT_TO_IMAGE`，还是同时承诺现有参考图链路的 `IMAGE_TO_IMAGE`。
2. 首期一个 Run 只创建一个 `generation_task` 并由其返回多图，还是立即支持一轮多个生成任务。
3. 是否现在移除 `generation_tasks.creation_task_id` 唯一约束。
4. Agent 表由 TS 直接读写其专属表，还是全部经 Java 内部 API；迁移仍建议统一由 Flyway 管理。
5. 首期是否将模糊历史图片的向量语义检索纳入范围；显式资产和最近回合确定性引用已经纳入。
6. 阿里云 LLM 的具体模型、结构化输出方式、超时和预算上限。
7. Agent 用户可见事件采用 TS 调 Java API 持久化并分发，还是由 TS 直写后增加可靠通知链路。
8. `WAITING_USER` 的首期表单协议、超时、取消和恢复请求格式。
