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
- `poster-design`：处理海报用途、视觉层级、主体布局和文字留白的原子型垂类 Skill；首期先用原子型 Skill 跑通单工具闭环，复合型 Skill 在基础链路稳定后再增加。

### 1.2 首期范围

- Agent 模式请求入口与状态查询。
- 独立 TypeScript Agent Service 和 RabbitMQ 消费者。
- 有限的意图分类、手动 Skill 选择与自动 Skill 路由。
- 内部版本化 Skill 注册、加载和工具白名单。
- 结构化模型动作与模型—工具执行循环。
- 复用现有文生图任务、MQ、转存和资产链路；一个 Agent Run 最多成功创建一个图像生成任务，该任务使用一个最终 Prompt 一次产出一至多张图片。
- `WAITING_TOOL` 异步等待、事件恢复和重复消息处理。
- 使用 Agent LLM 的多模态视觉能力按当前 Skill 标准检查已转存图片；首期检查发现问题时交付现有结果并给出调整建议，不在同一 Run 自动创建第二个生成任务。
- 持久化 Agent 执行事件及 SSE 实时展示。
- 一条最终助手消息和多个执行事件、图片资产的回合聚合展示。
- 最小结构化会话记忆；是否在首期启用待确认。

### 1.3 首期不包含

- 用户创建、上传、在线编辑或公开发布 Skill。
- Skill 市场和第三方 Skill。
- 多 Agent、子 Agent 或长时间自主后台工作。
- 默认不在首期主链引入向量数据库；模糊历史图片语义检索是否作为首期后续小步纳入仍待确认。
- 通用自动修复闭环；首期可由具备视觉能力的 Agent LLM 按当前 Skill 的质量标准检查结果并给出调整建议，但不触发第二次业务生成，也不承诺尚未接入的手部、文字等专项修复能力。
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
- 首期先按媒介、操作、启用状态、权限和 Tool 能力做硬过滤，再由模型基于候选 Skill 的 `name + description` 进行结构化语义选择；Skill 数量增长后可将候选发现替换为语义检索召回，最终选择仍须经过模型精排或等价选择器及 Runtime 校验。
- Skill 路由先于字段补全和追问。选中 Skill 后，由其完整正文决定必需信息、可采用的默认值、可自由发挥的范围和是否需要调用信息收集 Tool；未命中垂类图片 Skill 时由默认 `image-create` 承担通用补全规则。
- Skill 以单个 Markdown 文件发布，YAML frontmatter 只包含 `name` 和 `description`；`description` 同时作为发现和路由摘要，不重复维护 `triggerSummary`。
- Skill 正文承载领域知识、设计方法、Prompt 规范、工具调用时机、分支、默认值和验收要求；Runtime 不为不同设计 Skill 编写专属 Prompt Renderer。
- Skill 正文的“工具使用规范”表必须显式使用标准 Tool ID；Skill Loader 静态提取并校验该表中的工具名，形成当前 Skill 的运行时工具白名单。
- 不同 Skill 可以具有不同步骤、工具调用次数、调用时机、用户确认点和交付要求。
- Skill 负责创作策略；Runtime 强制工具权限、参数约束、状态转换、幂等、等待恢复和可确定验证的验收项。
- 首期不建设 Skill 历史版本库。单次服务生命周期内 Skill 文件不可变；更新 Skill 时先停止接收新 Run，等待或人工收敛全部非终态 Run，再停止 Agent Service 手工更新并在启动时重新校验。`WAITING_USER`、`PAUSED` 和异常遗留 Run 必须具备超时、取消或人工收敛手段，否则会阻塞发布排空。

### 2.2 服务与数据边界

- 现有 Java 主服务继续拥有用户、会话、消息、额度、图像任务、图片资产、OSS 和对外 API。
- 新 TypeScript Agent Service 负责意图识别、Skill 路由、上下文构造、模型—工具循环及 Agent 恢复。
- Java 是 Agent 业务状态、模型执行检查点、用户可见事件和 Outbox 的唯一写入者；TypeScript Agent Service 负责计算和编排，通过 Java 内部 API 提交带版本与幂等条件的状态转换，不直接写 MySQL。
- Agent 不得绕过现有内部图像任务入口直接调用图像供应商、扣额度、操作 OSS 或创建图片资产。
- 浏览器只连接 Java 主服务；继续复用现有认证用户级 `GET /api/events` SSE 接收生成、Agent、发布和通知增量，不建立浏览器到 TypeScript Agent Service 的直连或第二条 Agent 专属 SSE。
- 客户端需要参与的 Tool 使用“Java SSE 通知 + Java HTTP 提交”完成双向协作；Agent Service 通过 Java 内部 API、持久化状态和 RabbitMQ 间接等待与恢复，首期不引入 WebSocket。
- MySQL 是 Agent Run 和图像任务的唯一状态真相源；RabbitMQ 只传递最小执行命令。
- RabbitMQ 消息只包含事件 ID、Run ID、Run 版本、唤醒原因和必要的 Tool Call ID，不包含完整对话、Skill 正文或生产 Prompt。
- 图片只有完成 OSS 转存并形成可见 `image_assets` 记录后，才算可交付结果。

### 2.3 用户可见执行过程

- 前端展示结构化阶段、简短决策摘要、Skill 选择、工具进度和最终产物，不展示模型原始思维链、系统提示词或内部上下文。
- 一个 Agent 创作轮次保留一条 USER 消息和一条最终 ASSISTANT 消息。
- 意图识别、Skill 激活、生成进度和等待状态写入 Agent 执行事件，不写成普通会话消息。
- Run 执行期间前端锁定普通消息输入；暂停、恢复、取消使用结构化控制接口，不作为新 USER 消息传给模型。只有 Agent 调用 `generate_form_for_info_collection` 并进入 `WAITING_USER` 后，前端才允许提交该 Tool 所定义的表单结果。
- 前端以 `creation_task` 为回合边界，聚合 USER 消息、Agent Run、执行事件、最终 ASSISTANT 消息和图片资产。
- SSE 只承担实时增量；页面刷新和断线恢复必须能够从持久化数据重新构建回合。

### 2.4 记忆

- 当前最重要的记忆能力是把用户对历史图片的自然语言指代解析为真实 `assetId`，支持“把刚才第三张改亮”和“修改之前那张蓝头发拿剑的角色图”等请求。
- 资产引用按“前端显式 `assetId` → 最近回合、序号和版本等确定性指代 → 用户命名或标签精确匹配 → 向量语义检索”的顺序解析，不对“刚才、第三张、上一版”等明确指代优先使用向量近似搜索。
- MySQL 继续保存资产真实身份、用户归属、回合顺序、创意方向和派生关系；向量数据库只保存或索引图片语义描述与 `assetId` 引用，不能作为图片资产真相源。
- 向量检索返回候选 `assetId` 后必须回查 MySQL，重新校验用户归属、可见状态、删除状态及是否可作为当前操作输入。
- 多个语义候选接近时不得擅自选图，应由 Agent 调用 `generate_form_for_info_collection` 展示候选并进入 `WAITING_USER`；用户不能绕过该 Tool 自由发送选择消息。
- 首期 Agent 主链先实现显式资产、最近回合、图片序号和创意方向等确定性引用；是否把模糊历史图片语义检索和向量数据库纳入首期仍待确认。
- 默认比例、品牌色、禁止元素等权威参数如后续需要，仍使用结构化关系数据；它们不应仅保存为向量。

## 3. 关键决策记录

| 决策事项 | 最终结论 | 原因与取舍 | 对实现的影响 |
| --- | --- | --- | --- |
| Agent 服务语言与部署 | 新增独立 TypeScript Agent Service，保留 Java 主服务 | 模型、Skill 和 Tool 编排适合 TS 生态；现有可靠生成和业务资产能力无需重写 | 新增一个部署单元和 Agent MQ 消费者 |
| Agent 与图像服务边界 | Agent 通过 Java 内部 Tool API 创建和读取生成任务 | 防止两套语言重复实现额度、权限、幂等和资产规则 | TS 不直接写 `generation_tasks`、`image_assets` |
| 普通文生图 | 使用默认内部 `image-create` Skill | 统一垂类和通用创作的执行机制，避免 Runtime 业务分支膨胀 | 图片创作都经 Skill Runtime，聊天/查询/控制除外 |
| Skill 形态 | 单个带标准 frontmatter 的 Markdown 文件，随代码版本化发布 | 对齐参考 Skill 规范，创作知识和工作流保持为模型可直接理解的自然语言 | frontmatter 只保留 `name`、`description`；Run 固定保存 Skill 名称、版本和定义哈希 |
| Skill 路由摘要 | 直接使用 frontmatter 的 `description` | 避免与额外 `triggerSummary` 重复维护和漂移 | 路由阶段只加载启用 Skill 的 `name + description`，选中后再加载完整正文 |
| 工具权限 | 从正文标准“工具使用规范”表静态提取 Tool ID，Runtime 强制白名单 | 保持单文件交付，同时不把自然语言指令当作可靠权限边界 | 未知工具导致 Skill 加载失败；未授权 Tool Call 在执行前拒绝 |
| Runtime 形态 | 有限状态、Tool Registry 和模型—工具循环 | 控制面可测试，创作经验仍可由 Skill 扩展 | 不按 Skill ID 编写大型 `if/else` 流程 |
| 首期 Agent LLM | 使用千问 `qwen3.8-flash`，默认关闭思考模式 | 该模型支持 Function Calling 和 JSON Schema；首期任务重点是可靠编排而非复杂推理 | 通过 `AgentModelProvider` 隔离供应商协议，Run 保存模型及运行参数快照 |
| 模型能力分工 | 请求理解使用 Structured Output；Skill 执行使用原生 Function Calling；最终回复禁止 Tool Calling | 避免用自由文本或自定义 JSON 模拟工具协议，也不依赖同轮混用 Structured Output 与 Tools | Runtime 分阶段调用模型，并分别校验分类结果、Tool Call 和最终回复 |
| Skill 传入模型 | 向模型传当前 Skill 的完整有效正文，不传其他 Skill 正文或 Runtime 内部配置 | 模型直接阅读领域知识、设计方法、参考示例、Prompt 规范和工具调用时机 | 新增通用 Skill Loader；不把自然语言编译成专属代码，Run 固定 Skill 名称、版本和定义哈希 |
| Skill 更新 | 首期采用停机排空后手工更新，不建设历史版本库 | 项目内部 Skill 数量少且允许运维窗口，避免过早增加定义存储与在线兼容机制 | 服务生命周期内 Skill 不可变；发布前收敛全部非终态 Run，启动时校验定义哈希与多实例一致性 |
| Tool 协议 | 模型侧 Function Schema、Agent 内部 Tool Contract、Java Tool API Contract 分层解耦 | 防止业务代码绑定千问响应对象，并避免模型控制可信身份字段 | Provider Adapter 解析 Tool Call，Runtime 二次校验并注入可信上下文 |
| 并行工具调用 | 首期关闭模型协议的 `parallel_tool_calls`；一个 Run 最多成功提交一次 `text2image` 或 `image2image` | 避免依赖供应商并行 Tool Call 语义，并保持现有“一回合一个生成任务”关系 | 生图 Tool 使用一个最终 Prompt 和 `imageCount`；一次任务可产出多张图片 |
| 异步等待 | 提交生成后持久化为 `WAITING_TOOL` 并 ACK；生成终态事件重新唤醒 | 避免持有 MQ Delivery、进程内 Promise 或主动高频轮询 | Java 需在生成终态事务中创建 Agent Resume Outbox |
| 用户等待与运行中输入 | 保留 `WAITING_USER`，但只能由 Agent 主动调用 `generate_form_for_info_collection` 触发；其他执行阶段禁止用户自由插入消息 | 避免并发修改当前模型上下文，同时为 Skill 必需信息补充保留受控入口 | 前端仅在等待表单时开放对应提交；普通输入保持锁定，暂停、恢复、取消走结构化控制接口 |
| Agent 前端过程 | 展示持久化结构化事件，不展示原始思维链 | 同时满足可解释进度、隐私、安全和可恢复要求 | 新增 Agent 事件协议与聚合查询 |
| 浏览器与 Agent 连接 | 浏览器只连接 Java，复用用户级 `/api/events` SSE；用户动作继续提交 Java HTTP API | 人机 Tool 是低频、事务性双向协作，HTTP + SSE 已足够；避免 TS 重复认证、连接管理和多实例路由 | SSE 增加 `agent.run.updated`；TS 通过 Java 内部 API 和 RabbitMQ 间接与客户端协作，不新增 WebSocket |
| 会话消息语义 | 每轮一条最终 ASSISTANT 消息，阶段信息独立存储 | 避免将进度噪声带入后续模型上下文 | 现有每轮每角色唯一约束可以继续保留 |
| Runtime 消息恢复 | 持久化只追加的规范化执行步骤，由 Context Builder 投影为本次模型 `messages[]` | 逻辑上的连续消息流适合恢复上下文，但不能代替 Run 并发控制、Tool 幂等和业务任务状态 | 当前 Run 保留完整 Tool 配对；历史 Run 默认只取用户消息、最终回复、摘要和相关资产 |
| Agent 数据写入 | Java 统一写 Agent 表、模型步骤、事件、最终消息和 Outbox，TS 只通过内部 API 提交计算结果与状态转换请求 | 需要在同一本地事务中协调 Run、Tool、生成任务、会话消息和 Outbox，避免 TS/Java 双写补偿 | Java 分配版本与事件序号并校验租约、权限和幂等；TS 不直接写 MySQL |
| 首期资产引用 | 优先支持显式 `assetId`、最近回合和图片序号的确定性解析 | “刚才第三张”存在精确关系，不应使用近似向量搜索 | 保存 Run、Tool Call、唯一生成任务、资产和 `source_index` 关系 |
| 向量资产记忆定位 | 用于根据模糊自然语言描述召回历史图片候选，返回 `assetId` 引用 | 支持“之前那张蓝头发拿剑的图”，但不能代替权限和资产真相校验 | 后续或首期独立小步增加资产语义描述、Embedding、向量检索、重排和候选确认，具体范围待确认 |
| LLM 供应商 | 采用阿里云千问体系，首期模型为 `qwen3.8-flash` | 与现有生成供应商环境一致，但 Runtime 不绑定具体 SDK 或模型 | 具体 API 形态、超时和预算仍需真实环境验证 |
| 多张图片的首期策略 | 一个 Run 最多创建一个 `generation_task`，使用一个最终 Prompt 和 `imageCount` 一次产出多张候选图片 | 保持现有回合、额度、状态机和资产关系；用户未指定风格时由当前 Skill 在批次级 Prompt 中要求探索不同风格、构图或色彩 | 保留 `generation_tasks.creation_task_id` 唯一约束；不承诺 `source_index` 与预设风格一一对应 |
| 首期 Skill 复杂度 | 先实现原子型 Skill，再扩展复合型 Skill | 先验证自然语言 Skill 对 Prompt 和单工具行为的稳定影响，降低首条链路的状态组合 | `image-create`、`poster-design` 先围绕生图工具；搜索、表单和多工具串联保留 Tool 契约并分步接入 |
| 视觉验收 | 使用 Agent LLM 的视觉能力读取已转存资产，并按当前 Skill 的质量标准检查 | Prompt 技术检查不能代替成图检查；现有模型具备视觉能力 | 恢复阶段向模型提供受控图片内容并持久化安全验收摘要；首期发现问题时给出调整建议，不在同一 Run 自动重新生图 |

## 4. 实施计划与进度

| 小步目标 | 状态 | 完成内容或当前阻塞 | 验证方式/结果 |
| --- | --- | --- | --- |
| 1. 设计收敛 | 进行中 | 已明确 Java 唯一写入、追加式 Runtime 步骤、Context Builder、停机排空更新 Skill、一 Run 一个生成任务和受控运行中输入；详细状态转换和 API 契约仍待确认 | 本文评审通过后进入实施中 |
| 2. Agent 后端骨架 | 待开始 | Agent 表、执行快照、状态机、Outbox、MQ 拓扑、TS Consumer、版本和处理租约 | 重复投递、并发领取、结果未知和崩溃恢复自动化测试 |
| 3. 垂直切片一：最小文生图闭环 | 待开始 | 显式或默认 `image-create`、单次 `text2image`、`WAITING_TOOL`、异步恢复、最终消息、前端时间线和多图片资产展示 | 真实环境端到端生成、MQ 重投和刷新恢复验收 |
| 4. 垂直切片二：客户端参与 Tool | 待开始 | `generate_form_for_info_collection`、`WAITING_USER`、SSE 通知、HTTP 表单提交和 MQ 恢复 | 断线恢复、重复提交、多设备竞争和表单版本测试 |
| 5. 垂直切片三：增强与复杂并发 | 待开始 | 自动 Skill 路由、`poster-design`、搜索、暂停恢复、视觉验收和确定性资产引用 | 路由差异、暂停竞争、来源协议、视觉检查和资产引用测试 |
| 6. 可靠性收敛 | 待开始 | 取消、超时、模型格式错误、图像失败、转存失败、重复完成和发布排空 | 故障注入与端到端回归 |
| 7. 资产语义记忆 | 待开始 | 向量资产检索是否纳入首期待确认 | 模糊描述候选、权限回查和歧义确认测试 |

## 5. 设计与实现

### 5.1 分层架构

```text
Web 前端
  Agent 模式入口 / Skill 手动选择 / SSE 时间线 / 表单 / 图片网格
        │ Java HTTP + 用户级 GET /api/events SSE
        ▼
Java 主服务
  Agent 对外 API / 会话消息 / Agent 聚合快照 / Tool 内部 API
  额度幂等 / Generation / Asset / Agent 事件 Outbox / 用户级 SSE
        │                              │
        │ RabbitMQ                     │ MySQL（状态真相源）
        ▼                              ▼
TypeScript Agent Service          Agent、会话、任务、资产和 Outbox 数据
  Consumer / Intent Router / Skill Registry / Runtime / Tool Adapters / LLM Client
        │
        └─ 只通过 Java 内部 API 持久化业务动作、建立用户等待和创建图像任务
```

浏览器不直接连接 TypeScript Agent Service。服务端向客户端的过程通知统一由 Java 在业务状态可靠持久化后通过现有用户级 SSE 推送；客户端的表单提交、暂停、恢复和取消统一通过 Java HTTP API 进入。Java 再使用 Outbox 与 RabbitMQ 唤醒 Agent Service，因此浏览器断线不影响 Run、Tool 或生成任务继续收敛。

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

路由先于字段补全和追问。Runtime 先按目标媒介、生成操作、Skill 启用状态、用户权限和可用 Tool 做硬过滤；首期 Skill 数量较少时，将剩余候选的 `name + description` 与用户请求交给模型，以严格结构化输出返回 `suggestedSkillId` 和置信度。模型只提出建议，Runtime 校验通过后才固定当前 Skill。Skill 数量增长后，可将候选发现替换为关键词或 Embedding 语义召回 Top K，再由模型或等价选择器精排；向量相似度不能绕过硬过滤、Runtime 校验和默认 Skill 回落。

选中 Skill 后才加载完整正文，并由 Skill 决定必需字段、可使用的默认值、自由发挥范围、是否需要搜索以及是否必须调用信息收集 Tool。未命中垂类图片 Skill 时回落 `image-create`，通用主题、风格、构图、色彩和光影补全规则属于该默认 Skill，不在路由前由 Runtime 硬编码。

### 5.3 Skill 定义

Skill 对齐参考规范，一个 Skill 对应一个独立 Markdown 文件：

```text
agent-service/src/skills/definitions/
  image-create.md
  poster-design.md
```

文件开头使用 YAML frontmatter，且只允许 `name` 和 `description`：

```md
---
name: 海报设计技能
description: 本技能输出具有明确视觉层级和文字留白的海报视觉，适用于电影海报、活动海报和品牌主视觉，不处理高密度信息长图。
---

# 海报设计技能

## 角色定位
...

## 工具使用规范
| 工具名称 | 调用时机 | 说明 |
| --- | --- | --- |
| `text2image` | 信息完整且无参考图时 | 根据最终 Prompt 生成图片 |
| `image2image` | 用户提供参考资产并要求延续时 | 根据参考资产改造图片 |
```

`description` 是 Skill 的唯一发现和路由摘要，不再增加 `triggerSummary`。正文包含角色定位、领域知识、设计方法、阶段和分支、字段缺失处理、Prompt 组织规范、参考案例、工具调用规则、追问原则、视觉验收和输出规范。Skill 中的自然语言步骤直接作为当前模型的专业执行手册；Runtime 不理解具体风格，也不按 Skill 名称编写 Prompt 拼接代码。

首期采用通用 Skill Loader 而不是把自然语言编译成工作流代码。Loader 在启动时完成：

```text
读取单个 Markdown
  → 校验 frontmatter 只有 name、description
  → 校验名称、描述和正文
  → 从标准“工具使用规范”表第一列提取反引号包裹的 Tool ID
  → 校验 Tool ID 全部存在于 Tool Registry
  → 取得对应 Function Schema，形成当前 Skill 工具白名单
  → 计算定义哈希并结合平台注册配置形成固定版本
```

平台运行字段不写回 Skill frontmatter。启用状态、是否允许自动或手动调用、最大迭代次数和发布版本由 Agent Service 的注册配置或后续管理数据维护。运行时对象保持最小：

```ts
interface LoadedSkill {
  name: string;
  description: string;
  version: string;
  definitionHash: string;
  instructions: string;
  allowedToolIds: string[];
  toolSchemas: ModelToolDefinition[];
  maxIterations: number;
}
```

`instructions` 是当前 Skill 的完整有效正文，包括模型需要应用的设计构图思路、参考文案、Prompt 补充规则和工具调用时机。文件路径、平台注册配置、数据库字段、内部 API、MQ、幂等算法、权限实现、OSS 规则和部署信息不进入模型上下文。

路由阶段只加载所有启用 Skill 的 `name + description`；选中后，一个 Run 只加载当前 Skill 的完整正文和静态提取出的工具，不把其他 Skill 正文或所有平台工具同时交给模型。Run 保存 Skill 名称、版本和定义哈希用于审计、启动校验和多实例一致性检查。首期通过“服务生命周期内不可变、更新前排空全部非终态 Run”的发布约束保证等待恢复时仍使用同一定义，不建设在线历史版本读取机制。

首期先实现原子型 Skill：封装专业知识、个人风格或单个生图工具的 Prompt 方法。复合型 Skill 所需的搜索、表单、多阶段确认和多工具串联在原子型闭环稳定后增加；新增复合型 Skill 仍复用同一单文件格式和通用 Runtime，不引入按 Skill 名称分支的代码。

### 5.4 Runtime 与模型调用分阶段

Runtime 不按垂类 Skill 编写大型分支。首期将模型调用分为三个职责不同的阶段：

```text
阶段 A：请求理解与路由
  Qwen Structured Output + strict JSON Schema
  → RequestDecision

阶段 B：当前 Skill 执行
  Qwen 原生 Function Calling
  → tool_calls 或无 Tool Call 的完成候选

阶段 C：最终回复
  tool_choice = none
  → 面向用户的自然语言最终回复
```

`RequestDecision` 用于把自由文本归一化为请求类型、目标媒介、生成操作、场景、缺失信息和 Skill 建议。它不直接决定权限、额度、资产归属、Run 状态或 Tool 执行：

```ts
interface RequestDecision {
  requestKind: "CHAT" | "CREATE" | "EDIT" | "QUERY" | "CONTROL" | "UNSUPPORTED";
  targetModality: "IMAGE" | "TEXT" | "NONE";
  operation: "TEXT_TO_IMAGE" | "IMAGE_TO_IMAGE" | "NONE";
  scenario: "GENERAL_IMAGE" | "POSTER" | "OTHER";
  suggestedSkillId: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  needsUserInput: boolean;
  missingFields: string[];
  userVisibleSummary: string;
}
```

前端或请求协议已经提供可信结构时不让模型重复猜测。例如显式取消操作直接进入控制逻辑，显式 Skill 优先校验。自由自然语言入口才调用请求分类。Skill Router 按“用户显式选择且注册配置校验通过 → 模型依据 `name + description` 建议且校验通过 → 请求类型默认 Skill”确定最终 Skill；模型字段使用 `suggestedSkillId`，不赋予模型最终选择权。

Skill 执行阶段不再要求模型返回自定义 `AgentAction` JSON。`TOOL_CALL` 使用千问原生 `tool_calls`；请求用户信息映射为受控 Tool `generate_form_for_info_collection`；无 Tool Call 的文本只作为完成候选；权限或状态等确定性拒绝由 Runtime 产生。首期不依赖 `response_format` 与 `tools` 在同一模型请求中组合工作。

Runtime 内部维护或从持久化检查点重建模型执行消息序列，角色包括 `system`、`user`、`assistant` 和 `tool`。逻辑上，一个会话拥有持续追加的消息历史；物理上不覆盖单个 `messages_json` 大字段，而把用户可见对话和当前 Run 的规范化模型步骤分别持久化，再由 Context Builder 投影为本次模型调用的 `messages[]`。

用户可见的 `conversation_messages` 每回合只保存一条 USER 和一条最终 ASSISTANT。用户输入不复制到 Agent 步骤，`agent_runs.input_message_id` 直接引用本回合 USER 消息；模型 Tool Call 与 Tool Result 进入只追加的 `agent_run_steps`，并通过 `agent_tool_call_id` 引用 `agent_tool_calls` 中唯一保存的规范化参数和结果。Skill 正文和阶段事件不作为普通消息保存。当前 Run 的 Tool Call 与 Tool Result 必须完整配对，已完成历史 Run 默认只向上下文提供用户消息、最终回复、摘要和相关资产，不重复注入搜索全文、生成进度等执行噪声。

Context Builder 按“Runtime system 规则 + 当前部署且生命周期内不可变的 Skill 正文 + 当前工具 Schema + 会话摘要 + 相关历史轮次 + 当前 Run 完整执行轨迹 + 经权限回查的资产内容”构造本次请求，并执行 Token 预算、裁剪和供应商消息格式转换。规范化 Tool Call 保存已校验的参数和安全 Tool Result，不保存供应商原始消息对象、隐藏推理、签名 URL 或内部异常。

消息步骤只回答模型在语义上执行到哪里，不能单独作为分布式执行状态真相源。`agent_runs.status + run_version + lease` 决定消费者是否有权继续，`agent_tool_calls + generation_tasks` 决定 Tool 副作用是否已经发生，Outbox 与 MQ 事件 ID 负责可靠唤醒。MQ 重投时必须先读取执行快照并领取 Run，再根据结构化状态决定是否构造 `messages[]`；不能因为最后一条消息是 Tool Call 且尚无 Tool Result，就直接重复执行 Tool。

执行循环：

```text
读取并领取 Run
  → 确定性预检并构造当前输入、最近对话、关联资产和记忆
  → 必要时以 Structured Output 分类请求并取得 Skill 建议
  → Runtime 校验并确定最终 Skill
  → 加载固定版本 LoadedSkill 的完整正文和静态工具白名单
  → 持久化安全阶段事件及计划摘要
  → Qwen 通过原生 Function Calling 提出下一 Tool Call
  → Runtime 校验名称、Skill 白名单、本地 Schema、状态和幂等
  → 注入可信上下文并执行 Tool
  → 同步结果继续循环；异步结果进入等待；最终阶段禁止工具并完成 Run
```

首期调用 `qwen3.8-flash` 时默认设置 `enable_thinking=false` 和 `parallel_tool_calls=false`。不持久化、记录或展示 `reasoning_content`。如后续特定 Skill 需要思考模式，必须单独评测延迟、成本、协议限制和收益后启用。

### 5.5 Tool

计划内 Tool：

| Tool | 职责 | 备注 |
| --- | --- | --- |
| `text2image` | 将当前 Skill 收敛出的唯一最终 Prompt 通过 Java 内部 API 创建为生成任务 | 首期原子型主工具；一个 Run 最多成功创建一个任务，该任务按 `imageCount` 一次产出多张图片 |
| `image2image` | 使用一个或多个当前用户资产作为参考创建改图任务 | 是否进入首期闭环仍待确认；模型只提供 `assetId` 引用，Java 回查权限 |
| `creation_agent_search` | 搜索外部信息或创作参考 | 先保留 Tool ID、用途和安全边界，搜索供应商、结果协议和引用细节后续设计 |
| `generate_form_for_info_collection` | Agent 在当前 Skill 判断缺少必要信息时，展示文本、单选或多选表单并等待用户提交 | 不支持附件；只有该 Tool 成功建立等待后才开放表单提交，其他执行阶段禁止用户自由发送新消息 |

生成多张候选时，Agent LLM 按当前 Skill 收敛一个实际生产 Prompt，并通过 `imageCount` 请求一个生成任务一次产出多张图片。用户未指定风格时，当前 Skill 可以在批次级 Prompt 中要求候选探索不同风格、构图或色彩，但不能承诺每个 `sourceIndex` 与预设风格一一对应。调用示意：

```ts
interface TextToImageArguments {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string;
  imageCount: number;
  model?: string;
}
```

一次生图 Tool Call 最多成功创建一个 `generation_task`，并沿用现有 `generation_tasks.creation_task_id` 唯一约束；任务保存唯一 `final_prompt`，生成结果继续通过 `image_assets.source_index` 区分。Tool Call 使用稳定业务幂等键；模型第一次提出的参数若被 Runtime 在副作用发生前拒绝，可以修正后再次提出调用，但一个 Run 不得成功创建第二个生成任务。

Tool 统一返回结构化成功或错误，不向模型暴露内部异常正文。自动重试必须按 Tool 声明的 `NONE`、`SAFE_IDEMPOTENT`、`STATUS_CHECK_FIRST` 或 `MANUAL_RETRY` 策略执行；生成请求超时不得无条件重提。

Qwen Function Calling 是模型提出 Tool 申请的结构化协议，不等同于 `response_format=json_schema`。模型侧调用至少包含供应商 `call_id`、函数名和 JSON 参数字符串；Provider Adapter 将其解析为内部 Tool Contract，Runtime 仍须执行本地 Schema 与业务校验。

Tool 协议分为三层：

```text
Qwen Function Schema / tool_calls
  → AgentModelProvider Adapter
Agent 内部 Tool Contract
  → Tool Registry 校验、状态检查和可信字段注入
Java 内部 Tool API Contract
  → 权限、额度、幂等和业务副作用
```

模型只能提供 Prompt、比例、图片数量和输入资产引用等业务意图参数。`userId`、`sessionId`、`creationTaskId`、`agentRunId`、业务 Tool Call ID、幂等键、服务身份、OSS Key 和内部地址必须由 Runtime 从可信 Run Context 注入，不能出现在模型可控参数中。

供应商 `call_id` 只用于将 assistant Tool Call 与后续 Tool Result 对应；业务侧另行保存稳定的逻辑 Tool Call ID 和幂等键。重试或崩溃恢复不得因供应商重新生成 `call_id` 而重复创建生成任务。

Tool 输入 Schema 应由一个运行时 Schema 单一生成 TypeScript 类型、本地校验和模型 Function Schema，避免多份定义漂移。即使模型声称严格遵循参数 Schema，Runtime 仍必须重新解析、拒绝未知字段并校验范围。Tool 输出同样使用稳定、安全的小型 JSON，不向模型返回 OSS Key、签名 URL、供应商原始响应、数据库实体或异常堆栈。

`text2image` 和 `image2image` 是异步 Tool。成功创建唯一生成任务后，Runtime 持久化 Tool Call、关联任务和必要的模型执行轨迹，将 Run 切换为 `WAITING_TOOL` 并结束当前消费。该任务终态后恢复 Run。Runtime 读取已转存资产，以受控多模态输入交给具备视觉能力的 Agent LLM，按当前 Skill 的质量标准检查结果，再决定完成或给出调整建议。现有 `generation_task` 内部对瞬时供应商错误的有限重试仍可沿用；首期视觉检查不得通过创建第二个生成任务自动重做，用户如需调整应发起新回合。

### 5.6 端到端链路

```text
1. 前端提交 Agent 请求。
2. Java 在事务中创建 creation_task、USER 消息、agent_run 和 Agent Outbox。
3. Outbox 向 Agent 命令队列投递最小消息。
4. TS Consumer 通过 Run ID 和版本条件领取。
5. TS 持久化并推送 UNDERSTANDING、INTENT_IDENTIFIED 等事件。
6. 用户显式选择 Skill 时优先校验并使用，否则自动路由，最后回落默认 Skill。
7. Runtime 加载当前 Skill 完整正文，只向模型暴露从标准工具表静态提取且校验通过的 Tool。
8. 模型应用 Skill 的设计方法和 Prompt 规范，收敛唯一最终 Prompt，并产生包含 `prompt`、`imageCount` 等参数的 `text2image` 或 `image2image` Tool Call。
9. Runtime 校验后通过 Java Tool API 提交；Java 最多创建一个 generation_task、额度记录和生成 Outbox。
10. Agent Run 进入 WAITING_TOOL，Agent MQ 消息 ACK。
11. 现有生成和转存消费者完成供应商调用、OSS 转存及 image_assets 落库。
12. Java 在生成任务终态事务中创建 Agent Resume Outbox。
13. TS 收到恢复消息，读取该任务已保存的一至多张资产并完成技术验收，再把受控图片内容交给具备视觉能力的 Agent LLM 按 Skill 标准检查。
14. 视觉检查后模型生成最终用户回复；发现问题时交付现有结果并给出具体调整建议，不在同一 Run 创建第二个生成任务。
15. Java 原子写入最终 ASSISTANT 消息、Run 终态和最终事件。
16. 前端通过 SSE 增量更新，并在刷新时通过聚合查询还原完整 Agent 回合。
```

当当前 Skill 主动调用 `generate_form_for_info_collection` 时，步骤 8 前插入受控人机分支：

```text
TS 校验表单 Tool Call
  → 调用 Java 内部客户端参与型 Tool 接口
  → Java 在同一事务写 Tool Call（input_json 为安全表单 Schema）、WAITING_USER、Run 事件和通知 Outbox
  → TS 收到成功后结束当前消费并 ACK
  → Java 通过现有 /api/events 推送 agent.run.updated
  → 前端重新读取 Agent 回合聚合快照并渲染 activeForm
  → 用户只向 Java 表单提交接口发送匹配当前 Tool Call 的结构化结果
  → Java 原子保存 Tool Result、递增 Run 版本并写 Agent Resume Outbox
  → RabbitMQ 以 USER_CONTINUED 唤醒 TS
  → TS 重建 assistant Tool Call + tool result 消息并继续执行
```

SSE 是否在线不参与上述事务正确性：通知丢失或用户换设备后，REST 聚合快照仍能恢复 `WAITING_USER` 和当前活动表单。

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

前端时间线不读取或解析 Runtime 的原始 `system/user/assistant/tool` 消息序列，而只消费持久化的结构化 Agent 事件和现有生成任务状态。事件必须在确定性动作已经发生后产生：模型建议 Skill 不等于 `SKILL_SELECTED`，Java 成功创建任务后才能产生 `GENERATION_SUBMITTED`，图片完成 OSS 转存并形成可见资产后才能展示保存完成。模型消息序列用于执行恢复，`agent_run_events` 用于用户可见过程，REST 聚合快照用于刷新对账，SSE 只用于在线增量。

首期复用现有用户级 `GET /api/events`，新增轻量 `agent.run.updated` 事件，至少包含 `sessionId`、`creationTaskId`、`runId`、`runVersion`、`status` 和 `latestEventSequenceNo`，不直接携带完整表单、Tool 参数或 Tool Result。前端收到后可先按 `runVersion` 修补当前回合头部，再重新查询对应会话回合快照；SSE 首次连接或重连后继续执行 REST 全量对账。Agent 事件可能比现有生成状态更密集，实施时应合并同一 Run 的连续刷新，避免每个展示事件都触发重复请求。

### 5.8 Run、Tool、生成任务与多图片关系

一个 `creation_task` 表示一次用户创作请求，一个 `agent_run` 表示完成该请求的一次 Agent 执行，一个 `agent_tool_call` 表示模型提出并由 Runtime 受控执行的一次工具调用，一个 `generation_task` 表示唯一一次实际图像生成任务，一个 `image_asset` 表示该任务已保存的一张结果。

一个 Run 可以先后调用零到多次搜索或信息收集 Tool，但最多成功调用一次 `text2image` 或 `image2image` 并创建一个生成任务。该任务使用一个最终 Prompt，通过 `imageCount` 一次产出一至多张候选图片：

```text
creation_task
  └─ agent_run
       ├─ agent_tool_call：creation_agent_search（可选，可多次）
       ├─ agent_tool_call：generate_form_for_info_collection（可选，仅 Agent 主动触发）
       └─ agent_tool_call：text2image(prompt, imageCount)（最多成功一次）
            └─ generation_task
                 ├─ image_asset：source_index = 0
                 ├─ image_asset：source_index = 1
                 ├─ image_asset：source_index = 2
                 └─ image_asset：source_index = 3
```

实现时保留 `generation_tasks.creation_task_id` 唯一约束。生图 Tool Call 可通过可空的 `linked_generation_task_id` 显式关联唯一任务，用于幂等恢复和结果未知时查重；搜索和表单 Tool Call 不关联生成任务。多张图片共享同一 `final_prompt` 和生成配置，通过现有 `source_index` 区分。用户未指定风格时，当前 Skill 可以要求批次探索多样性，但系统不把每张图片预先绑定为独立风格方案。

### 5.9 记忆演进

Agent 记忆按用途分为四类：

| 类型 | 解决的问题 | 推荐实现 |
| --- | --- | --- |
| 会话资产引用记忆 | “刚才第三张”“上一版”“最后一张” | MySQL 中 Run、唯一生成任务、资产 `source_index` 和派生关系 |
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
2. 解析最近 Run、图片 `source_index`、上一版和最后一张。
3. 匹配用户命名和结构化标签。
4. 仍无法定位时，对图片语义描述执行向量检索并重排候选。
5. 第一候选不具有足够区分度时，由 Agent 调用 `generate_form_for_info_collection` 后进入 `WAITING_USER`，让用户从受控候选图片中选择。
```

首期每张生成图片至少能关联到最终 Prompt、Skill、图片 `source_index` 和真实 `assetId`，用于构造初始语义描述。后续可通过视觉模型按图片实际内容生成 Caption、主体、场景、风格和颜色等语义资料，再生成 Embedding。Prompt 描述不能被视为图片实际内容的可靠证明。

向量库只负责找“哪些图片可能符合用户描述”。最终资产读取和图生图输入仍回到 MySQL 与 Java Tool API 完成权限和状态校验。

## 6. 数据模型与配置

以下为设计草案。表名和字段仍需设计准入；写入所有权已经确定为 Java 主服务，TS Agent Service 只通过内部 API 读取执行快照和提交状态转换。

### 6.1 `agent_runs`

```text
id
user_id
session_id
creation_task_id
input_message_id
status
run_version
lease_owner
lease_expires_at
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
          │      → WAITING_USER → QUEUED 或 RUNNING
          └─────→ PAUSE_REQUESTED → PAUSED → QUEUED 或 RUNNING
```

保留 `WAITING_USER` 状态，但只能在当前 Skill 主动调用 `generate_form_for_info_collection` 且表单已可靠持久化后进入。其他状态下前端不得向当前 Run 追加自由文本 USER 消息；用户提交的表单结果只作为对应 Tool Call 的受控结果恢复同一个 Run。表单确认、超时、取消和恢复请求格式留待专项讨论。

暂停是 Agent 控制动作，不是发送给模型的消息。用户请求暂停后进入 `PAUSE_REQUESTED`，Runtime 在当前不可中断操作结束后的安全检查点进入 `PAUSED`，并禁止继续模型调用和新 Tool 副作用。已提交的 `generation_task` 不具备通用暂停语义，可以继续生成和转存；其终态只记录为已完成等待结果，直到 Run 恢复后再继续检查和最终回复。暂停检查点、租约和取消竞争规则进入实施前必须确认。

`run_version` 用于拒绝旧消费者和旧 MQ 消息的条件写入，`lease_owner + lease_expires_at` 用于判断当前消费者是否仍拥有执行权。消息轨迹不能替代版本和租约：两个消费者可能读取到完全相同的消息，但只有成功领取当前版本 Run 的消费者可以继续调用模型或产生新的 Tool 副作用。

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
PAUSE_REQUESTED
PAUSED
GENERATION_SUBMITTED
GENERATION_RUNNING
GENERATION_PROGRESS
ASSET_SAVING
RESULT_PREPARING
COMPLETED
FAILED
CANCELLED
```

### 6.3 `agent_run_steps`

当前 Run 的规范化模型执行轨迹采用只追加记录，逻辑上与其引用的会话消息和 Tool Call 一起按顺序组装为 `messages[]`：

```text
id
agent_run_id
sequence_no
step_type
role
model_invocation_id
provider
model
provider_response_id
agent_tool_call_id
content_json
input_digest
created_at
UNIQUE (agent_run_id, sequence_no)
UNIQUE (agent_run_id, model_invocation_id)
```

首期 `step_type` 包括：

```text
ASSISTANT_TOOL_CALL
TOOL_RESULT
```

首期不在步骤表复制 USER、最终 ASSISTANT、Tool 参数或 Tool Result 内容。`agent_runs.input_message_id` 引用现有 USER `conversation_messages`；最终 ASSISTANT 继续只写现有会话消息；`ASSISTANT_TOOL_CALL` 和 `TOOL_RESULT` 步骤通过 `agent_tool_call_id` 引用同一 `agent_tool_calls`，步骤只表达模型协议顺序。`content_json` 仅为未来确有供应商协议要求的中间安全文本预留，首期通常为 `NULL`。

`agent_tool_calls.id` 是平台内部主键，`call_id` 是模型协议中用于 Assistant Tool Call 与 Tool Result 配对的 ID，两者不得混用。Context Builder 读取步骤后，从所引用 Tool Call 的 `tool_name + input_json` 组装 Assistant Tool Call，并从 `output_json` 组装对应 Tool Result。

每次模型调用使用稳定 `model_invocation_id`。模型结果只有在 Java 以 `expectedRunVersion` 校验并成功追加步骤后，才能成为下一步执行依据；提交超时时 TS 先读取执行快照，不能直接再次调用模型。该唯一键使相同结果重试返回既有记录，版本条件使旧消费者的不同结果被拒绝。

`system` 通常不作为步骤逐次追加，而由 Context Builder 使用当前 Runtime 规则、当前部署的固定 Skill 正文和工具 Schema 重建。若后续 Runtime system 规则允许不停机更新，再单独增加模板版本策略；首期与 Skill 一样受停机排空发布约束。

### 6.4 `agent_tool_calls`

```text
id
agent_run_id
call_id
tool_name
status
idempotency_key
input_json
output_json
result_idempotency_key
expires_at
linked_generation_task_id
failure_code
started_at
completed_at
created_at
updated_at
UNIQUE (agent_run_id, call_id)
UNIQUE (idempotency_key)
```

`linked_generation_task_id` 仅供成功创建唯一图像任务的 `text2image` 或 `image2image` Tool Call 使用，其他 Tool 为 `NULL`。数据库与 Java 服务继续通过 `generation_tasks.creation_task_id` 唯一约束保证一个创作回合最多一个生成任务；稳定幂等键保证网络结果未知或恢复重试时不会创建第二个任务。

`generate_form_for_info_collection` 不建立独立输入请求表。它与其他工具一样使用 `agent_tool_calls`：`input_json` 保存 Runtime 和 Java 校验后的安全表单 Schema，`output_json` 保存按该 Schema 校验后的唯一有效提交，`expires_at` 控制等待期限，`result_idempotency_key` 保证客户端重复提交不会重复生成 Tool Result 或唤醒 Agent。候选 Tool 状态统一为 `CREATED / WAITING / SUCCEEDED / FAILED / CANCELLED / EXPIRED`；Tool Registry 声明执行模式为 `SYNC / ASYNC_TASK / CLIENT_INPUT`，Java 据此校验 `WAITING_USER` 只允许指向 `CLIENT_INPUT` Tool。

表单提交时，Java 在同一事务完成 Tool Call 条件更新、追加引用该 Tool Call 的 `TOOL_RESULT` 步骤、Run 从 `WAITING_USER` 转回 `QUEUED`、递增 `run_version`、写 Resume Outbox 和用户可见通知事件。前端 `activeForm` 是 Java 根据 `agent_runs.waiting_tool_call_id` 和 `agent_tool_calls.input_json` 生成的安全 DTO，不对应独立持久化表。

### 6.5 资产语义资料与派生关系

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

### 6.6 MQ

候选拓扑：

```text
Exchange: aivista.agent.commands
Queue: agent.run.execute
Routing Key: agent.run.execute
```

启动和恢复可使用同一队列，通过 `reason` 区分：

```ts
type AgentRunReason = "START" | "TOOL_COMPLETED" | "USER_CONTINUED" | "MANUAL_RESUME" | "RETRY";
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

### 6.7 配置

后续需确认：

- Agent MQ 开关、Exchange、Queue、Routing Key、prefetch 和并发数。
- Agent Run 执行租约、最大迭代次数、模型超时和安全重试次数。
- `qwen3.8-flash` 的 API 形态、密钥配置方式、超时、预算上限和真实环境行为；模型已经确定，运行参数仍需验证。
- 模型调用策略默认 `enable_thinking=false`、`parallel_tool_calls=false`；Structured Output 阶段不传 Tools，Function Calling 阶段不依赖 `response_format`。
- Java 内部 Tool API 基址和服务间认证。
- Skill 定义目录、启动校验和启用列表。
- Agent 执行事件保留和清理策略，以及用户级 SSE 连续事件的前端合并刷新窗口；首期不把 SSE 回放作为正确性前提。

## 7. API 与权限

接口仍为草案，需在下一轮详细设计确认。

### 7.1 对外 API

| 方法 | 路径 | 职责 |
| --- | --- | --- |
| `POST` | `/api/agent-runs` | 创建 Agent Run，支持可选 `skillId` 和输入资产 |
| `GET` | `/api/agent-runs/{runId}` | 查询 Run、当前阶段、Skill、最终消息和资产快照 |
| `GET` | `/api/events` | 复用现有认证用户级 SSE，新增 `agent.run.updated`；只作增量通知，REST 聚合快照负责刷新和断线恢复 |
| `POST` | `/api/agent-runs/{runId}/pauses` | 请求在安全检查点暂停 Agent；不向模型追加消息，也不承诺暂停已提交的生成任务 |
| `POST` | `/api/agent-runs/{runId}/resumptions` | 恢复已暂停 Run；具体动作路径命名待与项目统一风格确认 |
| `POST` | `/api/agent-runs/{runId}/cancellations` | 请求取消；是否改用现有项目统一动作风格待确认 |
| `POST` | `/api/agent-runs/{runId}/form-submissions` | 仅在 `WAITING_USER` 时提交当前信息收集 Tool 所定义的表单结果；禁止作为自由消息入口 |

创建请求必须带幂等键。所有接口按当前登录用户校验 Run、会话和输入资产归属。

表单提交请求必须同时携带当前 `runVersion`、`toolCallId` 和幂等键。Java 从对应 `agent_tool_calls.input_json` 读取已持久化的安全表单 Schema 重新校验，不能把提交内容当作普通 USER 消息，也不能接受不属于当前 `WAITING_USER` Tool Call 的自由字段。表单 Schema 在 Tool Call 建立后不可变，因此首期不另设 `formVersion`；暂停、恢复和取消同样以 Run 版本条件更新解决并发竞争。

### 7.2 Java 内部 Tool API

| 方法 | 候选路径 | 职责 |
| --- | --- | --- |
| `POST` | `/internal/agent-runs/{runId}/claims` | 按状态、`expectedRunVersion` 和租约原子领取执行权；只有成功领取者可以继续模型调用或新 Tool 副作用 |
| `GET` | `/internal/agent-runs/{runId}/execution-snapshot` | 返回恢复所需的 Run、规范化步骤、未完成 Tool、关联任务和等待资料，不返回内部异常或临时签名 URL |
| `POST` | `/internal/agent-runs/{runId}/model-results` | 以 `modelInvocationId + expectedRunVersion` 幂等追加已校验的 Assistant 文本或 Tool Call 步骤 |
| `POST` | `/internal/agent-tools/generation-tasks` | 校验权限、额度、唯一最终 Prompt、图片数量和幂等键，并为当前 Run 最多创建一个生成任务 |
| `GET` | `/internal/agent-tools/generation-tasks/{taskId}` | 读取终态和安全资产结果 |
| `GET` | `/internal/agent-tool-calls/by-idempotency-key/{key}` | 内部 API 超时或结果未知时查询既有 Tool Call 和业务副作用，禁止盲目重试 |
| `POST` | `/internal/agent-runs/{runId}/client-input-tool-calls` | 原子写入客户端参与型 Tool Call（安全表单 Schema 位于 `input_json`）、`WAITING_USER`、用户可见事件和通知 Outbox |
| `POST` | `/internal/agent-runs/{runId}/events` | 持久化 Agent 用户可见事件 |
| `POST` | `/internal/agent-runs/{runId}/completions` | 原子写最终消息和 Run 终态 |
| `POST` | `/internal/agent-runs/{runId}/failures` | 以稳定错误码收敛失败 Run |

内部 API 必须使用服务身份认证，且仍校验 Run 与业务对象的关联；不能仅因调用方位于内网就信任其传入的用户 ID、资产 ID 或任务 ID。

Agent Service 调用用户输入请求接口成功后才能结束当前消费并 ACK；接口超时属于结果未知，必须以稳定幂等键和 Run/Tool Call 状态查询确认，不得重复建立第二个活动表单。Java 只有在相关业务状态和事件事务提交后才通过用户级 SSE 发通知，Agent Service 不直接持有浏览器连接。

### 7.3 响应与错误

- 沿用项目统一响应 Envelope，不向用户或模型暴露数据库、MQ、供应商或 OSS 原始异常。
- Tool 错误至少包含稳定 `code`、是否可重试、是否需要用户操作和安全展示信息。
- 参数错误、状态冲突、额度不足、权限拒绝、供应商结果未知和资产转存失败必须使用不同错误码。

## 8. 异常场景、可靠性与安全

### 8.1 可靠性

- Run 使用 `status + run_version` 条件领取，旧版本和重复 MQ 消息安全 ACK。
- 同一时刻只有持有有效 `lease_owner + lease_expires_at` 的消费者可以调用模型或产生新 Tool 副作用；消息相同不代表两个消费者都具有执行权。
- 模型返回值只有在 Java 以 `model_invocation_id + expectedRunVersion` 幂等追加规范化步骤后才能成为下一步依据；提交超时时先读执行快照，不直接重复调用模型。
- Agent 创建和启动 Outbox 必须同事务；生成任务终态和 Resume Outbox 必须同事务。
- Agent 消费者不得在等待图像生成或用户输入期间持有 MQ Delivery。
- `text2image`、`image2image` 必须使用稳定业务幂等键；网络超时不代表服务端未接收，Runtime 必须先按 Run、Creation Task 或幂等键查询已有任务，不得无条件重复提交。一个 Run 最多成功创建一个生成任务。
- `PAUSE_REQUESTED` 只阻止安全检查点之后的新模型调用和 Tool 副作用；已经发出的模型请求可能继续计算，已经提交的生成任务可以继续执行和转存。生成终态恢复消息遇到 `PAUSED` 时只记录结果，不得绕过暂停继续执行 Agent。
- `RUNNING` 处理租约到期后的恢复规则待确认；必须区分模型调用前、Tool 副作用前后和结果未知状态。
- 最终 ASSISTANT 消息和 Run 终态必须幂等，重复恢复不得创建第二条最终消息。
- Agent 执行事件持久化并使用单调 `sequence_no`；现有用户级 SSE 只发送轻量增量通知，断线、换设备和重连统一通过 REST 聚合快照恢复，不以 `Last-Event-ID` 回放作为首期正确性前提。

### 8.2 安全

- 模型只获得当前 Skill 允许工具的说明，Runtime 在调用前再次校验。
- 模型只获得当前 Skill 编译后的工作指令，不获得 Skill 目录、内部配置或其他未激活 Skill 正文。
- Qwen Function Arguments 和 Tool Result 均视为不可信数据；必须经过本地 Schema 校验，且不能携带或覆盖 Runtime 注入的可信身份字段。
- Tool API 强制校验用户、会话、Run、任务和资产归属。
- 客户端只渲染平台注册的安全表单组件并提交结构化值，不执行模型返回的脚本、组件代码、URL 动作或任意客户端函数；模型生成的表单参数必须先经 Runtime 与 Java 双重 Schema 校验。
- 不向模型、事件、日志和文档写入密钥、OSS Key、长期 URL、完整供应商响应或系统提示词。
- Tool 返回、历史消息、参考文档和图片识别文本均视为不可信内容，不能改变系统权限和工具白名单。
- 取消后的 Run 不得继续产生新的 Tool 副作用。
- 除 `WAITING_USER` 对应的受控表单提交外，Run 执行期间拒绝追加用户消息；暂停、恢复和取消均为结构化控制动作，不进入模型对话。
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

Skill 的视觉验收和代码能够确定的技术验收必须同时保留。Runtime 先检查任务、数量、归属、尺寸和资产保存，再由具备视觉能力的 Agent LLM 读取受控图片内容，按当前 Skill 的构图、主体、文字、材质和风格标准输出结构化检查结论。视觉判断具有概率性；首期检查未通过时交付已生成结果并指出具体问题和调整建议，不在同一 Run 创建第二个生成任务，也不得宣称未经评测的识别准确率。

## 9. 测试与验收

### 9.1 自动化测试

- 意图结构化输出校验及非法输出修复或失败。
- 用户显式 Skill 优先级、硬条件过滤、模型基于 `name + description` 的自动匹配、非法建议拒绝和默认 Skill 回落。
- Skill 路由先于信息完整性判断；垂类 Skill 和默认 `image-create` 分别按自身规则决定默认补全、自由发挥和信息收集。
- Skill 禁用、输入不匹配、工具越权和参数非法。
- Run 状态机、版本条件领取和非法状态转换。
- Agent MQ、Resume MQ 重复投递。
- 生图 Tool 参数在副作用前被拒绝后允许修正，但一个 Run 最多成功创建一个图像任务；重复调用和结果未知恢复不创建第二个任务。
- 一个生成任务一次返回一至多张图片，所有图片共享唯一最终 Prompt，并通过 `source_index` 稳定展示和引用。
- 视觉检查输入、结构化结论、问题建议，以及检查不通过时不创建第二个生成任务。
- 图像成功、单任务内部分图片成功、失败、转存失败和结果未知。
- Agent Consumer 在 `RUNNING`、`WAITING_TOOL` 等阶段停止后的恢复。
- 普通执行阶段拒绝用户自由消息，只有 Agent 主动建立 `WAITING_USER` 后接受匹配当前 Tool Call 的表单提交。
- 表单请求必须与 `WAITING_USER`、Tool Call 和通知 Outbox 原子建立；表单提交必须与 Tool Result、Run 版本递增和 Resume Outbox 原子完成。
- 重复表单提交、两个设备同时提交、提交与超时/暂停/取消竞争时只有一个 `runVersion` 条件更新成功，其余返回稳定状态冲突且不重复唤醒 Agent。
- SSE 断线时表单仍可通过 REST 聚合快照恢复；SSE 不在线不影响 Agent 等待状态和用户提交结果的正确性。
- `PAUSE_REQUESTED` 在安全检查点收敛为 `PAUSED`；暂停期间生成任务可完成，但不得自动恢复模型执行，恢复动作不重复已完成 Tool 副作用。
- 最终消息、完成事件和资产关联不重复。
- 用户级 SSE 的 `agent.run.updated` 校验、连续通知合并、断线重连后的 REST 对账和页面刷新聚合结果。
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

真实环境还需验证：重复提交、表单双击与多设备竞争、暂停/取消与表单提交竞争、服务重启、MQ 重投、SSE 断线后的 REST 恢复、图片生成失败和转存失败。

### 9.3 首期完成标准

- Java、TS、RabbitMQ、MySQL、供应商、OSS 和前端链路完整运行。
- 普通文生图和至少一个垂类 Skill 的行为差异可观察且可测试。
- 一个 Run 最多可靠创建和恢复一个使用唯一最终 Prompt 的生成任务，并稳定展示该任务产出的一至多张图片及失败状态。
- Agent LLM 能读取最终资产并按当前 Skill 的质量标准给出结构化视觉检查结果；发现问题时给出调整建议，不在同一 Run 自动重新生图。
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
- 增加专项视觉检测和修复 Tool，并建立有评测基准的自动修复闭环；首期先使用 Agent LLM 的通用视觉能力进行 Skill 级检查。
- 增加更多内部 Skill，再评估在线发布、用户自定义和 Skill 审核体系。
- 扩展视频、音频等多模态能力；新增能力仍通过稳定 Tool Contract 和 Skill 接入。

### 10.1 进入实施前待确认

1. 首期原子型闭环只支持 `TEXT_TO_IMAGE`，还是同时承诺现有参考图链路的 `IMAGE_TO_IMAGE`；无论采用哪种操作，一个 Run 都最多成功创建一个生成任务。
2. `agent_run_steps` 的最终字段、Context Builder 的历史选择和 Token 预算规则，以及模型调用结果未知时的查询与重试契约。
3. 基于 `status + run_version + lease` 的完整状态转换矩阵，包括领取、续租、租约回收、终态幂等及旧 MQ 消息处理。
4. 首期是否将模糊历史图片的向量语义检索纳入范围；显式资产和最近回合确定性引用已经纳入。
5. `qwen3.8-flash` 使用 Chat Completions 还是 Responses API，以及超时、预算上限、结构化输出、Function Calling 和多模态视觉输入的真实环境兼容性。
6. `WAITING_USER` 的表单、普通方案确认、超时、取消和恢复请求格式；只有 Agent 主动调用信息收集 Tool 后才允许提交，其他执行阶段禁止用户自由消息。
7. `PAUSE_REQUESTED` 的安全检查点、模型请求在途处理、生成已提交后的暂停展示、恢复租约及与取消/终态事件的竞争规则。
8. `creation_agent_search` 的供应商、结果协议、来源引用和超时策略；当前只确定保留该 Tool，不在本轮展开实现细节。
