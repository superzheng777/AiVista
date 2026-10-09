# Agent 与普通创作架构

> 当前状态：已完成。Java 与 TS 各单实例，共享 MySQL；TS 的会话目录必须持久化。

## 职责与存储

| 部分 | 权威数据与职责 |
| --- | --- |
| Java | 登录鉴权、会话归属与提交图片授权、浏览器 REST/SSE、上传、资产查询与管理、社区和搜索 |
| TS | 创建会话与执行记录、Node 本地创作调度、Pi 运行、图片 MQ 派发和消费、额度预占、模型请求、图片转存、资产登记和生成结果结算 |
| MySQL | `generation_sessions` 会话索引；`executions` 执行状态；资产、额度、用户与社区业务表 |
| Pi JSONL | 用户消息、助手消息、工具调用与结果、表单回答、压缩记录，以及产品创作分轮标记 |
| OSS | 私有原图与生成图片的展示派生图；会话只保存不含签名的原图 URL 和 assetId |

一轮用户创作对应一条 `kind=CREATION` 的执行记录，mode 为 NORMAL 或 AGENT。一次实际生图对应同表的 `kind=GENERATION` 子记录，`parent_id` 指向创作，`(parent_id,tool_call_id)` 唯一。子记录用于结果、额度和独立于 Agent 停止的已发起生成，不增加用户创作轮数。

每个逻辑会话使用一个原生文件：`AIVISTA_SESSION_DIRECTORY/{userId}/{sessionId}.jsonl`。SQL 中的用户与会话 ID 决定文件路径；浏览器不能指定路径。没有第二份消息表、上下文快照表、表单表或 Worker 交付账本。

会话支持逻辑删除：`DELETE /api/generation-sessions/{sessionId}` 写入 `generation_sessions.deleted_at`，成功及本人重复删除返回 204；有活动创作或图片任务时返回 409。删除后禁止读取历史、改名、继续创作及访问其创作操作，保留 JSONL、图片、作品和额度记录。删除与新创作、改名通过会话行锁串行化；Java 过滤已删除会话的迟到 SSE 事件。前端侧栏删除入口已接入，成功后清理会话缓存和状态提示，删除当前会话返回新对话页，具体协议见 [创作通信协议](creation-protocol.md)。

## 提交与执行

1. 浏览器向 Java `POST /api/creations` 提交 NORMAL/AGENT、可选 sessionId、输入和设置。
2. Java 校验 JWT、用户协议、已有会话归属和本次选图权限，将授权后的原图引用传给内部 TS HTTP。
3. TS 对已有会话先加行锁，再验证归属、未删除、没有活动执行且创作数小于 30，建立执行记录并追加 `aivista.creation_started`。首次提交时先普通查询确认用户存在，再创建并锁定会话；不预先取得用户排他锁。
4. 事务提交后唤醒 Node 本地创作调度器，HTTP 返回 202。调度器启动及周期扫描 QUEUED 创作补漏，用状态和 revision 原子领取；同一会话串行，不同会话可异步执行。
5. 两种模式都打开同一会话的 SessionManager；NORMAL 运行固定生图流程，AGENT 创建 AgentSession，注入 Skill、工具和约束，执行模型循环。创作不投递 MQ。
6. NORMAL 流程和 Agent 生图工具共用图片任务入口：按 `(parent_id,tool_call_id)` 幂等创建 GENERATION 子执行，随后异步等待数据库结果。
7. 图片派发器扫描未投递的 QUEUED 子执行，通过 publisher confirm 向 `aivista.generation.execute.v1` 投递 `{generationId,expectedRevision}`，确认后写入 dispatched_at。消费者原子领取，在事务内检查额度与用户已预占任务上限并预占，再经过限速调用图片模型。
8. 图片模型响应先持久化，再转存图片；TS 在同一个 Kysely 事务内登记资产、退还未交付额度并写入子执行终态，结果可靠保存后 ACK 并通知等待者。
9. 等待者读取图片终态，将工具结果交回普通流程或 Pi；TS 写入 Pi 结果条目、继续 Agent 或收口创作状态，并将展示事件交给 Java 用户级 SSE。

生成链路不需要跨 Java 提交结果。社区审核、搜索索引和通知仍使用 Java Outbox；它们的可靠待办职责不由创作执行表替代。

## 单工具调用与 Skill 顺序

每条 assistant 消息最多发起一个工具调用，工具结果返回后再由模型决定下一步。有工具的模型请求显式设置 `parallel_tool_calls=false`；如果供应商仍返回多个调用，Harness 在工具执行前整批阻止并返回纠正提示，不任意挑选一个执行。这个约束作用于单个 Agent loop，不限制不同会话并发，也不改变图片 MQ 的 prefetch 或请求速率。

系统提示要求模型先查看可用 Skill 的名称与描述，匹配时先用 read 读取，理解方法后再决定是否需要 request_user_input 补充关键意图；没有匹配 Skill 时不强读，信息已充分时不重复确认。各 Skill 的触发边界、按需确认与完成条件见 [AI Runtime](../worker/AI-Runtime.md#pi-与工具)。Skill 匹配与信息是否充分仍由模型判断，不宣称运行器已实现语义匹配的硬性验证。多个设计方向逐次调用工具，同一提示词的一次生图仍可请求多张图片。

## 历史与模型上下文

历史接口返回整个会话，最多 30 轮。TS 遍历原生当前分支，按 creation_started 分轮，把有效条目投影为 `turns[].items[]`：text、tool、form、generation；SQL 补充创作状态、revision、错误和完成时间，并按 toolCallId 合入图片任务状态及已结算资产，避免图片已完成但 Pi 尚未记录工具结果时丢失图片卡片。text 用 phase 区分过程与最终回复；tool 传递名称、执行状态和可选技能名，UI 展示名称与计数，状态用于运行效果，Skill 读取也使用 tool。TS 在生成展示数据时移除工具参数、完整路径和返回正文，历史接口与实时事件均不传递这些详情；原生 Pi 会话仍保留完整工具记录供模型使用。压缩摘要、模型设置、隐藏 thinking 和图片二进制不进入展示。

普通和 Agent 生图共用原生 `message` 记录：用户输入、`assistant/toolCall`、`toolResult`。普通模式由程序构造调用，标记 provider 为 `aivista`、model 为 `programmatic-generation`、用量为零，不启动 LLM；Agent 模式由 Pi 自动保存模型调用和工具返回。每次调用只保存一份工具结果，不额外写生成完成的自定义消息。

`toolResult.content` 是模型可读的结果与资产 ID；`details` 保存 generationId、status、assets，以及失败时的 code/message/retryable。展示投影从 details 生成图片卡片；部分成功明确使用 PARTIALLY_SUCCEEDED。程序调用记录真实提示词、参考图、画幅、数量和 promptExtend，不添加虚构的设计说明。Agent 的公开创作说明只使用 assistant text，不在生图工具参数中重复保存；普通程序调用不构造设计说明。

模型上下文由 Pi SessionManager 恢复。默认 compaction 保留完整日志，在有效上下文中使用摘要和被保留的近期消息；不按产品创作轮次强制对齐压缩边界。展示历史读取完整分支，不能把 buildSessionContext 的压缩结果当聊天记录。

JSONL 在运行中按条目追加，助手流式 token 在前端实时显示，完成消息由 Pi 落盘。展示 DTO 是请求临时对象；运行期间 SessionManager 保持自身条目和模型上下文，运行结束 dispose 后解除引用，内存由运行时回收。

## 表单与继续执行

`request_user_input` 的工具结果包含表单定义，Pi 暂停后执行状态为 WAITING_INPUT，保存 pending_tool_call_id。浏览器仅提交 action、expectedRevision 和字段值；TS 根据已持久化定义验证必填、选项与未知字段。

回答以 `custom_message` 追加，customType 为 `aivista.form_answer`，content 为结构化 JSON 字符串，包含 creationId、toolCallId、action、title 和 fields 的 id/label/value。原工具结果不修改。Pi 将自定义消息转换为用户消息输入模型，前端投影则将回答合入原表单卡片；已填写、跳过、取消记录可折叠查看，不另造用户创作轮次。

接受回答后同一个执行转为 QUEUED 并增加 revision，唤醒本地创作调度器；不投递 MQ，不增加创作计数。相同回答重复 PUT 返回既有结果，冲突回答或旧 revision 返回冲突。达到第 30 轮后仍可提交该轮表单，新创作必须另开会话。

## 图片

图片队列只有一个异步消费者，`prefetch=200` 限制等待限速、模型调用、转存和结算中的未确认任务总数。请求在真正发出前平滑限速，默认每秒最多 2 次；没有额外的模型在途请求限制。限速按 API 调用次数计算，一次调用生成多张图片仍算一次。未 ACK 消息达到 200 后 RabbitMQ 暂停派发，单条结果结算并 ACK 后释放名额。等待图片结果的 Agent 不占图片消费者之外的创作消费名额。

等待结果以数据库为准，进程内通知用于及时唤醒，每两秒检查数据库兜底避免漏通知。创建及等待图片任务期间暂停 Agent 推理预算；模型请求发出前默认十分钟排队超时，实际发出后使用 Provider HTTP 超时。单实例之外的全局速率协调不在当前范围，不能直接增加消费者复制这套限速器。

本次选图由 Java 授权；TS 后续只从可信会话记录取图片引用。会话保存原图 URL，不保存预签名、AccessKey 或 Base64。提交给视觉模型前，Harness 将这些引用临时转换为 OpenAI 兼容请求的 image_url；图生图工具同样在请求前签名。inspect_image 读取会话中已有的可信引用，避免任意 URL 签名。

Java 在会话展示响应和 SSE 的结构化图片数组内补签名和 expiresAt。会话归属已经校验，不为每张历史引用重新执行资产权限查询；资产删除后停止新资产接口访问，物理清理和既有签名自然到期，历史引用可能显示不可用。

## 实时展示

历史响应和 SSE 共用 creationId、item.id 及内容结构。前端先用 REST 初始化 QueryClient 中的 SessionDetail，随后用 creation.updated 更新轮次状态，用 creation.item.upserted 替换对应内容项。文本事件携带当前完整文本，重复事件不重复追加。message-items.ts 供 Pi 实时事件与 session-projector.ts 共用，最终回复由成功创作的末条无工具调用 assistant stop 消息确定。UI 固定为可折叠过程、表单操作、最终回复、图片四区；流式过程文字在确认完成时按原 ID 提升为 final。

原生 Pi 和展示协议保留每次工具调用的独立身份与成功、失败、取消状态，不定义逻辑重试 ID。前端渲染时，将同一创作内连续同类的 text_to_image、image_to_image、inspect_image 分别合并为一行；过程文字、表单、final 文本或其他工具中断分组，generation 图片项不打断分组。read 与 request_user_input 保持逐次显示。多次调用的括号计数是“成功调用数/已发起调用总数”，不代表图片数量；单次不增加计数。工具行不显示右侧状态文字或图标；创作执行中且组内有 RUNNING 调用时，名称与计数轻微扫光，减少动态效果时使用静态主题色。状态仍用于计数，不删除失败或取消记录。该投影共用于实时缓存与历史展示，不修改或删除调用记录。工具状态由 TS 同时检查原生错误与结构化业务结果，避免业务失败被当作成功。

Pi 将供应商文字增量累积成当前文本块，TS 每 100ms 对相同 item.id 只保留最新完整文本再发送；第二次发送的是前两段的累计内容，前端按 ID 更新而非拼接增量。100ms 是合并刷新间隔，不是固定字符长度或网络包边界；有更新即可逐步展示，无需等待整段回答结束。

SSE 早于 POST 响应时短暂缓冲；迟到的历史响应不能覆盖较新 revision、较完整文本、final 分类、工具终态或已提交表单。普通 SSE 帧不重新请求历史；重连时读取一次历史对账。新增结果使资产列表缓存失效，历史状态不靠资产列表拼装。

## 故障与边界

没有明确交付的结果按失败处理，未交付数量不扣额度。数据库结算具有幂等性。尚未发出模型请求的图片任务可取消并退款；用户停止创作会停止 Pi 推理，已经发出的生图继续收尾、结算并进入资产库。消费重复消息只读取终态，不再次调用模型。已经持久化的模型响应可以继续转存和结算；请求可能已发出但结果未知时记录明确错误，不自动重放付费请求。

单实例 TS 串行保护同一会话，恢复等待前一次执行退出。重启时补启动 QUEUED 创作，RUNNING 创作（普通和 Agent）统一以 `CREATION_INTERRUPTED` 失败收口，不承诺从内存中的 Promise 无感续跑；WAITING_INPUT 表单保留，用户回答后继续。磁盘损坏、SQL 与 JSONL 之间的异常中断仍需要人工核对，不实现分布式租约、自动模型重跑或跨存储事务。新部署必须同时保留数据库与会话目录；数据库通过 V1 基础表、V2 图片任务和 V3 会话逻辑删除增量迁移演进，不修改已经应用的迁移；确需重新建库时使用独立 OSS 前缀。

V2 增加 `provider_started_at` 和 `provider_response_json`。前者是限速前持久化的调用意图，不证明请求已经发到供应商；同进程用 `local.started` 确认实际发出，仍在限速等待的请求可取消或排队超时。进程退出丢失该内存信息后，只有调用意图、没有响应的任务按结果未知收口，即使实际尚未发出也不冒险重放。父创作因进程中断失败不会撤销已经接受的图片任务，图片继续执行或按自己的恢复状态收口。

接口和事件字段见 [创作通信协议](creation-protocol.md)，运行与验证见 [AI Runtime](../worker/AI-Runtime.md)。
