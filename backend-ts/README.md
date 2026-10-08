# AiVista TypeScript AI Runtime

TS 负责原生 Pi JSONL 会话、Node 本地创作调度、图片任务 MQ、模型调用、OSS 转存，以及生成资产、额度和终态的事务结算。Agent 不进入 MQ；普通生成与生图工具共用图片队列，单消费者 `prefetch=200`，图片模型请求最多每秒启动 2 次。Java 是浏览器业务入口，管理认证、资产操作和社区。

安装依赖后运行 `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm worker`。默认测试不调用真实模型；隔离数据库测试使用 `AIVISTA_NATIVE_SCHEMA_TEST=true pnpm test:schema`（PowerShell 中先设置环境变量）。

- [运行、配置与验证](../docs/worker/AI-Runtime.md)
- [会话架构](../docs/architecture/Agent模式.md)
- [REST、SSE 与 MQ 协议](../docs/architecture/creation-protocol.md)

`var/sessions` 必须持久化并与 SQL 共同备份，不提交到 Git。两端连接同一个 `aivista` 库，OSS 默认前缀为 `users`。Java 用 Flyway 执行 V1 基础表及 V2 图片任务增量迁移，已有 V1 数据库原地升级。确需重置开发数据时同步清理数据库、会话文件、队列、搜索文档和旧 OSS 图片，避免数字 ID 重用造成对象路径冲突。

升级先停止 TS，再应用 V2，最后启动新 TS。迁移对既存 RUNNING 图片任务保守回填调用意图，恢复时不自动重复模型请求；未执行的 QUEUED 由新链路接管。
