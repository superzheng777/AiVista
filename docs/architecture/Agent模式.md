# Agent 与普通创作架构

> 当前状态：已完成。Java 与 TS 各单实例，共享 MySQL；TS 的会话目录必须持久化。

## 职责与存储

| 部分 | 权威数据与职责 |
| --- | --- |
| Java | 登录鉴权、会话归属与提交图片授权、浏览器 REST/SSE、上传、资产查询与管理、社区和搜索 |
| TS | 创建会话与执行记录、MQ 消费、Pi 运行、额度预占、模型请求、图片转存、资产登记和生成结果结算 |
| MySQL | `generation_sessions` 会话索引；`executions` 执行状态；资产、额度、用户与社区业务表 |
| Pi JSONL | 用户消息、助手消息、工具调用与结果、表单回答、压缩记录，以及产品创作分轮标记 |
| OSS | 私有原图与生成图片的展示派生图；会话只保存不含签名的原图 URL 和 assetId |

一轮用户创作对应一条 `kind=CREATION` 的执行记录，mode 为 NORMAL 或 AGENT。一次实际生图对应同表的 `kind=GENERATION` 子记录，`parent_id` 指向创作，`(parent_id,tool_call_id)` 唯一。子记录用于结果、额度和独立于 Agent 停止的已发起生成，不增加用户创作轮数。

每个逻辑会话使用一个原生文件：`AIVISTA_SESSION_DIRECTORY/{userId}/{sessionId}.jsonl`。SQL 中的用户与会话 ID 决定文件路径；浏览器不能指定路径。没有第二份消息表、上下文快照表、表单表或 Worker 交付账本。

## 提交与执行

1. 浏览器向 Java `POST /api/creations` 提交 NORMAL/AGENT、可选 sessionId、输入和设置。
2. Java 校验 JWT、用户协议、已有会话归属和本次选图权限，将授权后的原图引用传给内部 TS HTTP。
3. TS 锁定用户与会话，验证没有活动执行且创作数小于 30，建立执行记录并追加 `aivista.creation_started`。会话首次提交时创建。
4. TS 扫描未投递的 QUEUED 创作，通过 publisher confirm 向 `aivista.creation.execute.v1` 持久化队列投递 `{executionId,expectedRevision}`，确认后写入 dispatched_at。
5. 消费者用 `WHERE status='QUEUED' AND revision=?` 原子更新为 RUNNING；只有更新成功者执行。重复或旧版本消息直接结束。
6. 两种模式都打开同一会话的 SessionManager；NORMAL 运行固定生图流程，AGENT 创建 AgentSession，注入 Skill、工具和约束，执行模型循环。
7. 生图前在 TS 事务内检查额度与用户并发并预占；转存完成后在另一事务内登记资产、退还未交付额度、写入子执行终态。所有 SQL 使用同一 Kysely transaction。
8. TS 写入 Pi 结果条目、收口创作状态，并将展示事件交给 Java 用户级 SSE。

生成链路不需要跨 Java 提交结果。社区审核、搜索索引和通知仍使用 Java Outbox；它们的可靠待办职责不由创作执行表替代。

## 历史与模型上下文

历史接口返回整个会话，最多 30 轮。TS 遍历原生当前分支，按 creation_started 分轮，把有效条目投影为 `turns[].items[]`：text、tool、form、generation；SQL 只补充执行状态、revision、错误和完成时间。text 用 phase 区分过程与最终回复；tool 仅展示名称、执行状态和可选技能名，Skill 读取也使用 tool。TS 在生成展示数据时移除工具参数、完整路径和返回正文，历史接口与实时事件均不传递这些详情；原生 Pi 会话仍保留完整工具记录供模型使用。压缩摘要、模型设置、隐藏 thinking 和图片二进制不进入展示。

普通和 Agent 生图共用原生 `message` 记录：用户输入、`assistant/toolCall`、`toolResult`。普通模式由程序构造调用，标记 provider 为 `aivista`、model 为 `programmatic-generation`、用量为零，不启动 LLM；Agent 模式由 Pi 自动保存模型调用和工具返回。每次调用只保存一份工具结果，不额外写生成完成的自定义消息。

`toolResult.content` 是模型可读的结果与资产 ID；`details` 保存 generationId、status、assets，以及失败时的 code/message/retryable。展示投影从 details 生成图片卡片；部分成功明确使用 PARTIALLY_SUCCEEDED。程序调用记录真实提示词、参考图、画幅、数量和 promptExtend，不添加虚构的设计说明。Agent 的 userFacingPlan 由系统提示要求填写，普通程序调用无需该字段。

模型上下文由 Pi SessionManager 恢复。默认 compaction 保留完整日志，在有效上下文中使用摘要和被保留的近期消息；不按产品创作轮次强制对齐压缩边界。展示历史读取完整分支，不能把 buildSessionContext 的压缩结果当聊天记录。

JSONL 在运行中按条目追加，助手流式 token 在前端实时显示，完成消息由 Pi 落盘。展示 DTO 是请求临时对象；运行期间 SessionManager 保持自身条目和模型上下文，运行结束 dispose 后解除引用，内存由运行时回收。

## 表单与继续执行

`request_user_input` 的工具结果包含表单定义，Pi 暂停后执行状态为 WAITING_INPUT，保存 pending_tool_call_id。浏览器仅提交 action、expectedRevision 和字段值；TS 根据已持久化定义验证必填、选项与未知字段。

回答以 `custom_message` 追加，customType 为 `aivista.form_answer`，content 为结构化 JSON 字符串，包含 creationId、toolCallId、action、title 和 fields 的 id/label/value。原工具结果不修改。Pi 将自定义消息转换为用户消息输入模型，前端投影则将回答合入原表单卡片；已填写、跳过、取消记录可折叠查看，不另造用户创作轮次。

接受回答后同一个执行转为 QUEUED 并增加 revision，重新派发；不增加创作计数。相同回答重复 PUT 返回既有结果，冲突回答或旧 revision 返回冲突。达到第 30 轮后仍可提交该轮表单，新创作必须另开会话。

## 图片

本次选图由 Java 授权；TS 后续只从可信会话记录取图片引用。会话保存原图 URL，不保存预签名、AccessKey 或 Base64。提交给视觉模型前，Harness 将这些引用临时转换为 OpenAI 兼容请求的 image_url；图生图工具同样在请求前签名。inspect_image 读取会话中已有的可信引用，避免任意 URL 签名。

Java 在会话展示响应和 SSE 的结构化图片数组内补签名和 expiresAt。会话归属已经校验，不为每张历史引用重新执行资产权限查询；资产删除后停止新资产接口访问，物理清理和既有签名自然到期，历史引用可能显示不可用。

## 实时展示

历史响应和 SSE 共用 creationId、item.id 及内容结构。前端先用 REST 初始化 QueryClient 中的 SessionDetail，随后用 creation.updated 更新轮次状态，用 creation.item.upserted 替换对应内容项。文本事件携带当前完整文本，重复事件不重复追加。message-items.ts 供 Pi 实时事件与 session-projector.ts 共用，最终回复由成功创作的末条无工具调用 assistant stop 消息确定。UI 固定为可折叠过程、表单操作、最终回复、图片四区；流式过程文字在确认完成时按原 ID 提升为 final。

SSE 早于 POST 响应时短暂缓冲；迟到的历史响应不能覆盖较新 revision、较完整文本、final 分类、工具终态或已提交表单。普通 SSE 帧不重新请求历史；重连时读取一次历史对账。新增结果使资产列表缓存失效，历史状态不靠资产列表拼装。

## 故障与边界

没有明确交付的结果按失败处理，未交付数量不扣额度。数据库结算具有幂等性，不自动重试不明确的付费模型调用。用户停止创作会停止 Pi 推理，已经进入模型服务的生图可以完成并进入资产库。

单实例 TS 串行保护同一会话，恢复等待前一次执行退出。进程突然终止、磁盘损坏、SQL 与文件之间的异常中断采用人工核对并收口，不实现分布式租约、自动模型重跑或跨存储事务。新部署必须同时保留数据库与会话目录；重新建库时使用独立 OSS 前缀。

接口和事件字段见 [创作通信协议](creation-protocol.md)，运行与验证见 [AI Runtime](../worker/AI-Runtime.md)。
