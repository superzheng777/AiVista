# TypeScript AI Runtime

## 运行职责

`backend-ts` 使用 Nest application context，提供仅供 Java 访问的内部 HTTP，在 Node 内直接异步调度创作，管理原生 Pi 会话；仅图片任务经 RabbitMQ 削峰。图片执行器调用百炼和 OSS，并直接在 MySQL 事务内登记生成资产、结算额度与终态。浏览器仍只访问 Java。

代码入口是 `src/worker.ts` 和 `generation-worker.module.ts`。`sessions/` 集中实现会话存储、执行状态、投影、图片请求适配和内部 API；`agent/` 保留 Pi Harness、模型绑定、表单协议与工具；`generation/` 负责图像模型、限流和转存。社区业务仍由 Java 实现。

`CreationDispatcherService` 在创建、表单回答及周期扫描时本地调度；`GenerationTaskService` 统一图片创建、等待和执行；`GenerationQueueService` 负责图片可靠发布与消费；`GenerationRateLimiterService` 只约束请求启动时刻。

## 本地启动

要求 Node.js 22.19+、pnpm、MySQL 8.4、RabbitMQ，以及百炼和 OSS 配置。

```powershell
cd backend-ts
pnpm install --frozen-lockfile
$env:AIVISTA_JAVA_LOCAL_YAML = '../backend/aivista/src/main/resources/application-local.yaml'
pnpm typecheck
pnpm test
pnpm build
pnpm worker
```

配置桥读取 Java 本地 YAML 与同目录 application.yaml，不复制密钥；TS 环境变量优先。若 Java 本地 YAML 已填写固定 worker-api.token，TS 应直接复用该值，不要另设不同的 AIVISTA_GENERATION_WORKER_TOKEN；使用环境变量方式时，两端都应通过同一占位符读取同一个值。两端使用同一个 `aivista` 数据库，Java 通过 Flyway 在空库依次执行 V1 基础表、V2 图片任务和 V3 会话逻辑删除增量迁移；本轮统计与通知改造按已确认的开发数据重置方案修改了 V1，旧开发库须先重置后初始化，不能仅追加 V2/V3 或用 repair 跳过校验；要保留数据的环境需另写增量迁移，详见[用户统计与通知去重模块](../java/modules/用户统计与通知去重模块.md)。确需重置开发数据时，应先停止服务，再同步清理数据库、会话目录、项目队列、搜索文档和 OSS 图片，避免 ID 重用。

升级顺序：先停止 TS，确认旧进程已退出，再由 Java/Flyway 应用尚未执行的迁移，最后启动新 TS。V2 为既存 RUNNING 图片执行回填保守的调用意图标记，恢复时按结果未知收口，避免将可能已付费的请求重新发送；尚未执行的 QUEUED 记录由新调度链路接管。V3 增加 `generation_sessions.deleted_at` 和可见会话列表索引，新 TS 必须在 V3 完成后启动。不要在旧 TS 仍可能调用模型时运行迁移或并行启动新消费者。

内部 `DELETE /internal/generation-sessions/{sessionId}` 校验归属并锁定会话，检查创作和图片任务均已结束后写入删除时间；重复删除本人会话幂等。有活动任务返回 SESSION_BUSY，未知或他人会话返回 NOT_FOUND。查询、改名、继续创作和创作操作统一拒绝已删除会话，Java 丢弃迟到事件；JSONL、执行、资产、作品和额度均保留。外部接口返回 204，前端侧栏删除入口已接入，成功后清理会话缓存和状态提示，删除当前会话返回新对话页，详见 [创作通信协议](../architecture/creation-protocol.md)。

## 主要配置

| 配置 | 默认 / 作用 |
| --- | --- |
| AIVISTA_RUNTIME_HOST / PORT | 127.0.0.1 / 8890，内部 HTTP |
| AIVISTA_JAVA_BASE_URL | http://127.0.0.1:8888/api，事件转发 |
| AIVISTA_GENERATION_WORKER_TOKEN | 双向内部 HTTP 共享令牌，必须非空 |
| AIVISTA_SESSION_DIRECTORY | backend-ts/var/sessions，持久化 JSONL 根目录 |
| AIVISTA_DB_* | 与 Java 相同的 aivista 库；连接时显式 SET time_zone='+00:00' |
| AIVISTA_GENERATION_QUEUE_ENABLED | 是否启动图片任务派发与消费者；独立 TS 配置默认 false，复用 Java 基础配置时默认 true |
| AIVISTA_GENERATION_PREFETCH | 图片消费者最多持有的未确认任务数，默认 200 |
| AIVISTA_GENERATION_QUEUE_TIMEOUT_MS | 图片模型请求发出前的排队最长时间，默认 600000ms |
| AIVISTA_AGENT_ENABLED | 是否接收 Agent 创作，默认 false；启用时必须同时开启图片队列 |
| AIVISTA_AGENT_MODEL | qwen3.8-flash |
| AIVISTA_AGENT_MAX_TURNS | 单次 Pi Loop 上限 20，与每会话 30 次用户创作不同 |
| AIVISTA_AGENT_LOOP_TIMEOUT_MS | 每次执行/表单恢复后的 Agent 推理预算，默认 20 分钟；创建和等待图片任务期间暂停计时 |
| AIVISTA_GENERATION_MODEL | bailian/qwen-image-2.0 |
| AIVISTA_GENERATION_DAILY_IMAGE_QUOTA | 每用户每业务日 12 张 |
| AIVISTA_GENERATION_MAX_ACTIVE_PER_USER | 同时预占但未结算的生成执行上限 4 |
| AIVISTA_GENERATION_RATE_LIMIT_PER_SECOND | 所有图片模型请求合计每秒启动上限，默认 2 |
| AIVISTA_OSS_OBJECT_PREFIX | 默认 users；清空数据库并重用数字 ID 前应同步清理旧图片 |
| AIVISTA_OSS_ORIGINAL_SIGNED_URL_TTL_SECONDS | 模型读取原图的临时 URL，默认 600 秒 |
| AIVISTA_LANGFUSE_ENABLED | 默认关闭；开启需配置 Langfuse 公钥、私钥和地址 |

LLM 使用 AIVISTA_AGENT_BAILIAN_BASE_URL 与 AIVISTA_AGENT_BAILIAN_API_KEY；后者可复用图像模型 Key。不得将凭据、签名 URL 或完整本机会话文件提交 Git。

## Pi 与工具

Harness 使用固定项目根目录，加载 `.pi/SYSTEM.md` 与显式 Skill 目录。生产调用传入按用户/会话打开的 SessionManager；测试可使用内存 SessionManager。模型绑定跨执行复用，Pi session 对象每次执行后释放，JSONL 原始记录保留。

每条 assistant 消息最多调用一个工具。有工具的模型请求在图片适配后设置 `parallel_tool_calls=false`；供应商返回多个工具时，Harness 在执行前整批阻止，让模型读取错误后改为单工具调用，不产生该批业务副作用。系统提示要求先判断现有 Skill 是否匹配并读取适用内容，再决定是否有必要发需求表单；不强制无关 Skill 或重复确认。Skill 选择属于模型遵循提示的行为，单工具数量限制则有代码校验。单次生图工具仍可生成 1–6 张，不同会话保持并发。

| 工具 | 作用 |
| --- | --- |
| read | 读取白名单 Skill 与引用文件，不开放任意磁盘访问 |
| request_user_input | 返回结构化表单并暂停；不能与其他工具混合调用 |
| inspect_image | 将可信会话图片引用交给模型请求图片适配器 |
| text_to_image | 基于提示词执行图片生成 |
| image_to_image | 使用可信会话中的图片生成 |

CreationRuntimeService 由本地调度器领取执行后按本轮 mode 分流。NORMAL 使用 runNormalGeneration 写入原生调用与结果；AGENT 进入 runAgentPrompt，恢复上下文并执行 Pi Loop。两条路径共用图片任务创建和等待结果入口，模型调用、转存及结算由独立图片消费者完成。工具返回的 content 用于模型，details 用于历史投影，REST 与 SSE 复用同一内容项结构。

生成工具受画幅、总数量和图片引用集合约束。输出提示词、真实生图执行和图片结果关联；失败工具结果供模型理解，但不自动重复不确定的付费生成。原生压缩保持默认语义，不要求按创作轮次切分。

表单回答追加自定义用户消息，原工具结果保留。展示投影读取完整分支，模型读取 Pi 构建的有效上下文。图片在 JSONL 中为 unsigned URL + assetId；before_provider_request 临时注入 image_url，不保存 Base64。工具返回的图片在请求中附带资产 ID 和参考素材说明，避免把历史图片误当成新的用户要求；本轮明确修改优先于历史提示词与参考图外观。

## 展示投影

session-projector.ts 读取 SessionManager.getBranch() 的完整分支，按产品创作标记分轮；SQL 补创作状态，并按 toolCallId 合入图片执行状态与结算资产，压缩只影响模型上下文。图片已结算但 Pi 尚未写入结果时仍能恢复图片卡片。message-items.ts 统一转换原生 assistant/toolResult 与实时事件，避免历史和 SSE 使用两套分类。

text.phase=process 保留各次模型调用的公开文字；成功创作末条 stop 回复且无 toolCall 时为 final。tool 展示项仅包含标识、名称、状态和可选技能名，通过 toolCallId 关联；调用参数、完整路径和返回正文仅保留在原生 Pi 历史，不进入 REST/SSE 展示数据。表单与生成图片从工具结果提取所需结构化字段，有自己的卡片 ID，不与工具项冲突。模型 thinking、工具图片字节及系统消息不输出。前端四区布局保留，整个过程和已处理表单可折叠，工具条目不可展开；字段见[创作通信协议](../architecture/creation-protocol.md)。

百炼模型的思考开关由 `AIVISTA_AGENT_THINKING_ENABLED` 控制，默认 false；配置桥可读取 Java YAML 的 `app.agent.model.thinking-enabled`。`agent-runtime.ts` 在 `before_provider_request` 的图片适配之后，针对 `aivista-bailian` 显式写入 `enable_thinking`，不只修改 Pi 的本地 reasoning 配置。关闭思考不禁止模型输出公开 text，前端仍显示公开过程与最终回复；原生 thinking 无论开关如何都不进入展示 DTO。

## 可靠性

创作本地调度器在创建、表单回答后唤醒，并启动及周期扫描 QUEUED 创作；通过状态和 revision 原子领取。同一个创作的恢复执行等待先前运行退出，不同会话异步执行，不再受整轮创作的四个消费名额限制。

图片任务以 `(parent_id,tool_call_id)` 幂等创建，发布确认后更新派发标记。队列 `aivista.generation.execute.v1` 仅传 generationId、expectedRevision。单个异步消费者 `prefetch=200`，等待限速、模型调用、转存及结算合计不超过 200 条未确认消息。限速器在请求真正发出前平滑放行，默认间隔至少约 500ms，进程卡顿后不补发积攒名额；进程启动先冷却一秒，不存在额外的模型并发 gate。限速器按单实例设计，多消费者部署必须重新协调共享速率。图片请求发出前使用独立排队超时，发出后使用 Provider HTTP 超时；排队超时不会重新调用模型。

图片消费者在发模型请求前检查额度和每用户已预占未结算任务数，然后预占；尚未消费的排队记录不占预占额度。模型响应先保存，再转存及结算；`GenerationSettlement` 用一个 SQL 事务登记结果、退款和子执行终态，重复结果返回既有资产。图片任务终态可靠保存后 ACK 对应消息，释放一个名额；其他异步任务在此期间继续运行。额度按图片执行创建时的北京时间业务日记录，跨日完成不会误扣新一天。等待者使用数据库终态，内存通知与每两秒检查保证结果先完成或通知遗漏时也能结束等待。

同次创作的实时过程事件按内容项合并，经有序 HTTP 发送链转发给 Java；图片任务独立发送状态和结果事件。两条链之间不保证全局顺序，前端按稳定条目 ID 和状态合并，客户端重连通过完整历史恢复。事件发送失败不影响生成，社区 Outbox 不参与逐 token 事件。

未发出模型请求的图片任务可以取消并退款；已经发出的请求不因 Agent 取消而撤销，继续保存结果和结算。重启时补启动 QUEUED 创作，RUNNING 创作（普通和 Agent）统一以 `CREATION_INTERRUPTED` 失败收口；WAITING_INPUT 表单保留，用户回答后继续。图片已有持久化模型响应时继续转存和结算；请求可能发出但结果未知时明确失败，不自动重放付费调用。JSONL 与 SQL 不构成同一个事务，文件损坏或跨存储异常仍需要人工核对；会话目录必须使用持久卷，多实例共享目录与跨节点执行不在当前范围。

迁移 `V2__persist_generation_provider_handoff.sql` 增加 `provider_started_at` 和 `provider_response_json`。调用意图在进入限速等待前写入；实际发请求时同步设置进程内 `local.started`，不在速率放行后等待 SQL，从而避免数据库延迟导致请求挤在一起发出。同进程仍能取消尚未发出的任务；重启后没有这份内存证据，仅有意图且没有响应时保守归为 `GENERATION_OUTCOME_UNKNOWN`。父创作以 `CREATION_INTERRUPTED` 收口不会将已接受图片自动取消。

## 验证

会话创建、改名和删除只协调目标 `generation_sessions` 行，不再预先对用户主表执行 `FOR UPDATE`。已有会话必须先取得会话锁，再读取活动执行状态，避免提前建立旧快照；新会话保留普通用户存在性检查。生成配额预占中的用户锁仍用于同一用户跨任务的并发上限校验，不随本次会话锁清理移除。会话创建与表单回答涉及 JSONL 写入，不自动重试整个事务。

- `pnpm typecheck`：源码及测试类型。
- `pnpm test`：使用 forks 单进程工作池，覆盖 Faux Pi、工具约束、表单恢复、原生文件、压缩、四区投影、实时/历史一致性、请求 URL 适配和外部 I/O；不付费调用模型。
- 设置 `AIVISTA_NATIVE_SCHEMA_TEST=true` 后 `pnpm test:schema`：创建独立临时库，验证 CAS、30 轮上限、归属、重复结算、部分成功和跨日退款；结束删除该临时库。
- `pnpm test:agent-smoke` 必须显式设置 RUN_AGENT_SMOKE=true 才调用真实模型。日常自动回归不启用。
- 本地端到端验证使用专用测试账号，连接已配置的数据库、OSS 和远程基础服务，不额外创建持久化测试库或修改 OSS 前缀；限制生图次数。30 轮边界使用构造计数或 JSONL，不连续调用模型 30 次。

本次队列验收覆盖超过四个创作并发启动、统一图片限速、未 ACK 上限、重复投递、排队取消、响应复用、结算幂等、表单恢复及历史/SSE 图片状态。真实供应商调用只能证明实际调用链路，不替代故障和速率边界的自动化验证；测试结果以当前命令输出为准，不沿用旧链路的通过数量。

协议见 [创作通信协议](../architecture/creation-protocol.md)，产品边界见 [Agent 与普通创作架构](../architecture/Agent模式.md)。

### 用户统计拆表后的联调

Java 注册事务同时创建 `users` 和 `user_stats`，TS 不维护社交计数。TS 的执行、额度、会话 SQL 继续关联用户主表。会话用户预锁清理后，35 项真实 MySQL 测试、类型检查与编译通过；新增不存在用户校验及四类会话操作与用户共享锁并存的验证，同会话创建/删除、改名/删除、30 轮上限保护继续通过。当前开发库按[用户统计与通知去重方案](../java/modules/用户统计与通知去重模块.md)重置；旧本地用户会话文件一并清理，OSS 由用户后续处理，联调用户 ID 从 10 开始。
