# TypeScript AI Runtime

## 运行职责

`backend-ts` 使用 Nest application context，提供仅供 Java 访问的内部 HTTP，发布并消费创作 MQ 命令，管理原生 Pi 会话，调用百炼和 OSS，并直接在 MySQL 事务内登记生成资产、结算额度与终态。浏览器仍只访问 Java。

代码入口是 `src/worker.ts` 和 `generation-worker.module.ts`。`sessions/` 集中实现会话存储、执行状态、投影、图片请求适配和内部 API；`agent/` 保留 Pi Harness、模型绑定、表单协议与工具；`generation/` 负责图像模型、限流和转存。社区业务仍由 Java 实现。

## 本地启动

要求 Node.js 22+、pnpm、MySQL 8.4、RabbitMQ，以及百炼和 OSS 配置。

```powershell
cd backend-ts
pnpm install --frozen-lockfile
$env:AIVISTA_JAVA_LOCAL_YAML = '../backend/aivista/src/main/resources/application-local.yaml'
pnpm typecheck
pnpm test
pnpm build
pnpm worker
```

配置桥读取 Java 本地 YAML 与同目录 application.yaml，不复制密钥；TS 环境变量优先。若 Java 本地 YAML 已填写固定 worker-api.token，TS 应直接复用该值，不要另设不同的 AIVISTA_GENERATION_WORKER_TOKEN；使用环境变量方式时，两端都应通过同一占位符读取同一个值。两端使用同一个 `aivista` 数据库，Java 通过唯一的 `V1__initialize_schema.sql` 初始化空库。旧版本测试数据需要重置时，先停止服务并清理项目队列、搜索文档、会话文件和 OSS 图片，再清空原库、通过 V1 重建；不能在旧迁移历史上直接运行新的 V1。

## 主要配置

| 配置 | 默认 / 作用 |
| --- | --- |
| AIVISTA_RUNTIME_HOST / PORT | 127.0.0.1 / 8890，内部 HTTP |
| AIVISTA_JAVA_BASE_URL | http://127.0.0.1:8888/api，事件转发 |
| AIVISTA_GENERATION_WORKER_TOKEN | 双向内部 HTTP 共享令牌，必须非空 |
| AIVISTA_SESSION_DIRECTORY | backend-ts/var/sessions，持久化 JSONL 根目录 |
| AIVISTA_DB_* | 与 Java 相同的 aivista 库；连接时显式 SET time_zone='+00:00' |
| AIVISTA_GENERATION_QUEUE_ENABLED | 是否启动统一创作派发与消费者 |
| AIVISTA_AGENT_ENABLED | 是否接收 Agent 创作，必须同时启用队列 |
| AIVISTA_AGENT_MODEL | qwen3.8-flash |
| AIVISTA_AGENT_MAX_TURNS | 单次 Pi Loop 上限 20，与每会话 30 次用户创作不同 |
| AIVISTA_AGENT_MAX_CONCURRENT | 统一创作消费者 prefetch，默认 4 |
| AIVISTA_AGENT_LOOP_TIMEOUT_MS | 单次 Agent 执行最长 20 分钟 |
| AIVISTA_GENERATION_MODEL | bailian/qwen-image-2.0 |
| AIVISTA_GENERATION_DAILY_IMAGE_QUOTA | 每用户每业务日 12 张 |
| AIVISTA_GENERATION_MAX_ACTIVE_PER_USER | 同时预占但未结算的生成执行上限 4 |
| AIVISTA_GENERATION_MAX_CONCURRENT_CALLS | 图像 Provider 并发上限 25 |
| AIVISTA_GENERATION_RATE_LIMIT_PER_SECOND | 图像 Provider 每秒调用上限 2 |
| AIVISTA_OSS_OBJECT_PREFIX | 默认 users；清空数据库并重用数字 ID 前应同步清理旧图片 |
| AIVISTA_OSS_ORIGINAL_SIGNED_URL_TTL_SECONDS | 模型读取原图的临时 URL，默认 600 秒 |
| AIVISTA_LANGFUSE_ENABLED | 默认关闭；开启需配置 Langfuse 公钥、私钥和地址 |

LLM 使用 AIVISTA_AGENT_BAILIAN_BASE_URL 与 AIVISTA_AGENT_BAILIAN_API_KEY；后者可复用图像模型 Key。不得将凭据、签名 URL 或完整本机会话文件提交 Git。

## Pi 与工具

Harness 使用固定项目根目录，加载 `.pi/SYSTEM.md` 与显式 Skill 目录。生产调用传入按用户/会话打开的 SessionManager；测试可使用内存 SessionManager。模型绑定跨执行复用，Pi session 对象每次执行后释放，JSONL 原始记录保留。

| 工具 | 作用 |
| --- | --- |
| read | 读取白名单 Skill 与引用文件，不开放任意磁盘访问 |
| request_user_input | 返回结构化表单并暂停；不能与其他工具混合调用 |
| inspect_image | 将可信会话图片引用交给模型请求图片适配器 |
| text_to_image | 基于提示词执行图片生成 |
| image_to_image | 使用可信会话中的图片生成 |

CreationRuntimeService 在领取执行后按本轮 mode 分流。NORMAL 使用 runNormalGeneration 写入原生调用与结果；AGENT 进入 runAgentPrompt，恢复上下文并执行 Pi Loop。两条路径共用生图、转存和结算逻辑，公共执行函数不写会话结果。工具返回的 content 用于模型，details 用于历史投影，REST 与 SSE 复用同一内容项结构。

生成工具受画幅、总数量和图片引用集合约束。输出提示词、真实生图执行和图片结果关联；失败工具结果供模型理解，但不自动重复不确定的付费生成。原生压缩保持默认语义，不要求按创作轮次切分。

表单回答追加自定义用户消息，原工具结果保留。展示投影读取完整分支，模型读取 Pi 构建的有效上下文。图片在 JSONL 中为 unsigned URL + assetId；before_provider_request 临时注入 image_url，不保存 Base64。工具返回的图片在请求中附带资产 ID 和参考素材说明，避免把历史图片误当成新的用户要求；本轮明确修改优先于历史提示词与参考图外观。

## 展示投影

session-projector.ts 读取 SessionManager.getBranch() 的完整分支，按产品创作标记分轮；SQL 补状态，压缩只影响模型上下文。message-items.ts 统一转换原生 assistant/toolResult 与实时事件，避免历史和 SSE 使用两套分类。

text.phase=process 保留各次模型调用的公开文字；成功创作末条 stop 回复且无 toolCall 时为 final。tool 展示项仅包含标识、名称、状态和可选技能名，通过 toolCallId 关联；调用参数、完整路径和返回正文仅保留在原生 Pi 历史，不进入 REST/SSE 展示数据。表单与生成图片从工具结果提取所需结构化字段，有自己的卡片 ID，不与工具项冲突。模型 thinking、工具图片字节及系统消息不输出。前端四区布局保留，整个过程和已处理表单可折叠，工具条目不可展开；字段见[创作通信协议](../architecture/creation-protocol.md)。

## 可靠性

`ExecutionRepository.claim` 通过 QUEUED+revision 原子领取；同一个创作的恢复执行等待先前运行退出。`GenerationSettlement` 用一个 SQL 事务登记结果、退款和子执行终态，重复结果返回既有资产。额度按执行创建时的北京时间业务日记录，跨日完成不会误扣新一天。

实时事件按内容项合并，经单条有序 HTTP 发送链转发给 Java；失败事件不影响生成，客户端重连通过完整历史恢复。社区 Outbox 不参与逐 token 事件。

进程崩溃后的 RUNNING 执行由管理员核对并标记失败、结算未交付额度，不自动重复模型请求。会话目录必须使用持久卷；多实例共享目录与跨节点执行不在当前范围。

## 验证

- `pnpm typecheck`：源码及测试类型。
- `pnpm test`：使用 forks 单进程工作池，覆盖 Faux Pi、工具约束、表单恢复、原生文件、压缩、四区投影、实时/历史一致性、请求 URL 适配和外部 I/O；不付费调用模型。
- 设置 `AIVISTA_NATIVE_SCHEMA_TEST=true` 后 `pnpm test:schema`：创建独立临时库，验证 CAS、30 轮上限、归属、重复结算、部分成功和跨日退款；结束删除该临时库。
- `pnpm test:agent-smoke` 必须显式设置 RUN_AGENT_SMOKE=true 才调用真实模型。日常自动回归不启用。
- 本地端到端验证使用专用测试账号，连接已配置的数据库、OSS 和远程基础服务，不额外创建持久化测试库或修改 OSS 前缀；限制生图次数。30 轮边界使用构造计数或 JSONL，不连续调用模型 30 次。

当前通过 82 项单元测试、5 项独立临时库集成测试、typecheck 与 build。默认单元命令跳过的 5 项数据库测试已经单独启用并通过。真实联调已用专用账号完成一次普通生成和一次 Agent 读取海报 Skill、提交表单、生成并检查图片、输出最终回复；各生成一张图片。恢复服务后从同一 JSONL 读取历史并通过桌面/手机浏览器验证四区、折叠、图片加载与刷新一致性。跳过、取消和失败场景采用自动化构造，不额外调用真实生图。

协议见 [创作通信协议](../architecture/creation-protocol.md)，产品边界见 [Agent 与普通创作架构](../architecture/Agent模式.md)。
