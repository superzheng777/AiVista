# AiVista TypeScript AI Runtime

TS 负责原生 Pi JSONL 会话、Node 本地创作调度、图片任务 MQ、模型调用、OSS 转存，以及生成资产、额度和终态的事务结算。Agent 不进入 MQ；普通生成与生图工具共用图片队列，单消费者 `prefetch=200`，图片模型请求最多每秒启动 2 次。Java 是浏览器业务入口，管理认证、资产操作和社区。

Agent 每条模型回复最多调用一个工具，模型请求关闭并行工具调用，运行器会拒绝违规的多工具批次。系统提示要求先判断 Skill 匹配并读取适用内容，再决定是否需要用户确认；没有匹配 Skill 或需求已充分时不强制增加读取或表单。不同会话仍可异步并发运行。百炼思考开关由 `AIVISTA_AGENT_THINKING_ENABLED` 控制（默认 false），使用 Pi 原生 Qwen 兼容配置生成 `enable_thinking`，并明确使用百炼支持的 system 角色；模型支持思考不代表当前开启思考。公开过程文字与工具状态仍正常展示。

安装依赖后运行 `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm worker`。默认测试不调用真实模型；隔离数据库测试使用 `AIVISTA_NATIVE_SCHEMA_TEST=true pnpm test:schema`（PowerShell 中先设置环境变量）。

图片转存后为 `card.webp`、`display.webp` 补写一小时私有 HTTP 缓存，元数据失败沿用清理重试；原图默认缓存 600 秒，签名有效期不变。已有对象补写及验证范围见[图像访问与分发优化模块](../docs/java/modules/图像访问与分发优化模块.md)，不引入签名缓存表或 Redis。

- [运行、配置与验证](../docs/worker/AI-Runtime.md)
- [会话架构](../docs/architecture/Agent模式.md)
- [REST、WebSocket 与 MQ 协议](../docs/architecture/creation-protocol.md)

`var/sessions` 必须持久化并与 SQL 共同备份，不提交到 Git。两端连接同一个 `aivista` 库，OSS 默认前缀为 `users`。Java 用 Flyway 执行 V1 基础表、V2 图片任务及 V3 会话逻辑删除迁移。本轮用户统计与通知去重改造已更新 V1，旧开发库必须按已确认的数据重置方案重新初始化，不能直接升级或用 repair 绕过校验；需保留旧数据的环境必须另行提供增量迁移，见[用户统计与通知去重模块](../docs/java/modules/用户统计与通知去重模块.md)。确需重置开发数据时同步清理数据库、会话文件、队列、搜索文档和旧 OSS 图片，避免数字 ID 重用造成对象路径冲突。

升级先停止 TS，再由 Java/Flyway 应用尚未执行的迁移，最后启动新 TS。V2 对既存 RUNNING 图片任务保守回填调用意图，恢复时不自动重复模型请求；未执行的 QUEUED 由新链路接管。V3 增加会话 `deleted_at` 及未删除会话列表索引，必须先迁移再运行新 TS。

会话删除仅写逻辑删除标记，保留 JSONL、执行、图片、作品和额度；有活动创作或图片任务时返回冲突。已删除会话禁止读取和继续操作，协议见 [创作通信协议](../docs/architecture/creation-protocol.md)。前端侧栏删除入口已接入，成功后清理会话缓存和状态提示，删除当前会话返回新对话页。

实时事件使用 `ws` 原生 WebSocket：Java 每活动用户连接一次 `/internal/events`，TS 直接适配 Pi text_delta，无时间批处理；message_end 统一转换并发送完整文字和工具结果，sync 快照恢复。创作收尾保留最终文字分类与结构化状态校正，不重发过程文字。HTTP 历史和 WS 共用快照读取及游标校验，每轮返回 stream:{id,sequence}；浏览器只补入历史请求期间尚未被快照覆盖的事件。sequence 由 TS 维护，不来自 Pi，也不写入 JSONL。运行器直接消费 Pi 原生事件，经 onItem/onDelta 输出公开项与增量，observer 提供运行追踪，不维护额外的原生事件改名层。Pi 完成消息追加后释放临时展示项；活跃执行的历史查询和表单写入复用同一 SessionManager，结束后解除引用。详见[实时协议与验收](../docs/architecture/creation-protocol.md)。

资源加载器与 Agent 共用同一个内存 SettingsManager。运行器直接 await session.prompt() 完成 Pi 的重试、压缩和收尾，不额外包装结束事件 Promise。工具展示和 Langfuse 共用失败判定：isError、details.outcome=FAILED 或 details.status=FAILED；部分成功保留已交付图片。
