# AiVista TypeScript AI Runtime

`backend-ts` 只运行 AI 与异步 I/O Worker，不提供浏览器 API。前端始终调用 Java Core；Java 保留认证、用户、社区、发布状态、通知、搜索、SSE、额度以及核心事务的所有权。

Java 已提供 `/agent-creations`，并通过同一个 Outbox/Direct Exchange 向独立的 `agent.creation.execute` Quorum Queue 派发最小 `AGENT_EXECUTE` 命令。TS 的独立 Agent Consumer 已接通执行快照、OSS→Pi `ImageContent`、短生命周期 Pi Session、Agent Ledger、稳定 Activity 与幂等 Completion；首个 `poster-design` Skill 通过受限 `read` 按需披露正文。Agent 和 Generation Consumer 使用独立并发池。Pi 事件经 `AgentEventNormalizer` 聚合后，通过实例级 Java–TS WebSocket 和浏览器已有 SSE 实时显示；Tool/Skill 稳定边界提前幂等持久化，最终 Completion 全量兜底。最终状态由 Java 提交后通知前端重新读取 REST 快照。用户取消已采用 Java 权威事务、Java→TS WebSocket 控制帧、Pi `session.abort()`/Tool `AbortSignal` 和重连快照对账实现。

## 当前边界

- Java 使用事务 Outbox、Publisher Confirm 和持久 Quorum Queue 发布生成命令。
- TS Pipeline 连续完成百炼、下载和 OSS，再通过带 `contractVersion` 与确定性 `completionId` 的幂等 HTTP 向 Java 提交一次最终结果。
- Java 的 `generation_tasks` 是唯一生成状态来源：`QUEUED → GENERATING → SAVING → SUCCEEDED/PARTIALLY_SUCCEEDED/FAILED`。TS 在调用百炼前和开始持久化图片前，通过内部 HTTP 上报两个中间阶段；Java提交后尽力通过既有 SSE 投影给浏览器。
- 普通生成不再使用 `generation_worker_executions`。RabbitMQ 重投时，TS 读取非终态任务并重新执行完整 Pipeline；极少数进程中断可能重复调用 Provider，最终 Completion 仍由 Java 幂等提交。TS 进程内使用 active task 集合阻止并发重复执行。
- TS 只消费一个生成命令；旧 Transfer Queue、Worker Result Queue、分段消费者和运行切换开关均已删除。
- 排队超时和资产清理由 Java 保留，因为它们会修改 Java 拥有的业务状态。
- 发布审核属于 Java 发布领域，由 Java 完成审核调用、状态、通知与失败恢复；TS 不参与。
- Agent Runtime 按 Java、TS 各单实例的边界小步实施，不提前引入跨实例租约。主模型固定为支持图片输入与 Function Calling 的百炼 `qwen3.8-flash`；`qwen-image-2.0` 只承担实际图片生成。一次 Creation 创建一个短生命周期、`SessionManager.inMemory(explicitCwd)` 的 Pi Session 和最多 20 Turn 的 Loop；Generation Session 是 MySQL 中的跨轮逻辑会话。共享 ModelRuntime、受控 ResourceLoader、系统提示词、active Tool 白名单、内联 Harness Extension 和事件 Adapter 构成 Runtime 外壳。不保存 Data URI、Pi JSONL、Thinking 或逐 Token。Assistant 有 Tool Call时由 Pi执行并继续，没有 Tool Call且有文字时自然结束。Tool 等待同进程 Generation Worker，Completion 被 Java确认后由进程内 Coordinator 唤醒。`poster-design` 已按 Pi 的 Skill 索引→受限 `read`→正文渐进披露链路接通；`read` 不能越过 `.pi/skills`。内部 WebSocket只传实时文字、Tool 进度、取消和心跳。Agent Creation 支持 `AUTO/0` 或用户指定的画幅与总数量约束；约束通过执行快照注入 Pi。每次 Tool 的 `imageCount` 支持 1～6，同方向可单任务多图，不同方向可拆为多个 Tool。详见 `../backend/aivista/Agent模式模块.md`。

共享线协议位于 `../contracts/generation-worker/v1`。

单命令 Pipeline 已完成切换：TS 幂等检查点、Java completion 接口、真实文生图和图生图均已验证；旧 Transfer/Result MQ 代码以及 `generation_tasks` 的 Provider 快照、Transfer 时间字段由 Flyway V19 清理。Worker 执行中状态只存在 TS Ledger，不重复写入 Java 业务任务。

Agent 小步实施进度：中文系统提示词已放入 Pi 原生 `.pi/SYSTEM.md`；Provider 位于 `src/agent/providers/`，正式 `text_to_image` / `image_to_image` 位于 `src/agent/tools/` 并由 `index.ts` 汇总。短生命周期内存 Session、最近 12 条/12,000 code point 的数据库纯文本历史预装、最多 20 Turn 的 Harness 和 Pi 原生文本事件投影已完成。图片历史不隐式注入，只认当前请求授权 Asset ID；暂不增加摘要字段。当前请求图片会按顺序注入为 `ImageContent`，同时在本轮追加系统上下文中绑定其准确 Asset ID，避免模型为 `image_to_image.inputAssetIds` 猜测内部标识；Tool 与 Java仍执行双层授权校验。两个 Tool 已通过本地 Faux Provider验证 Tool Call → Tool Result → 下一 Turn，并通过真实端到端文生图、图生图验证；Faux 只存在于测试。`src/agent/adapters/java-generation-client.ts` 已实现真实任务创建调用；`AgentGenerationToolExecutor` 已组合该 Client 与同进程 `GenerationCompletionCoordinatorService`。独立 Agent Consumer 会读取 Java权威快照、加载授权 OSS 图片、运行 Pi、先持久化可重放 Ledger 结果，再调用 Java Agent Completion；只有 Java事务确认后才 ACK。Worker 只在 Java Generation Completion 事务确认后唤醒等待的 Tool，Tool 再把权威 Asset ID 或失败码返回 Pi。

## Agent 模型冒烟测试

迭代零只验证 Pi 与 `qwen3.8-flash` 的真实接线，不启动 Agent Worker，也不修改 Java业务数据。在未显式设置 `RUN_AGENT_SMOKE=true` 时，相关集成测试自动跳过。

先在 `backend/aivista/src/main/resources/application-local.yaml` 的 `app.agent.model` 中填写 `base-url`，保持 `thinking-enabled: false`。Agent 默认复用 `app.generation.bailian.api-key`；只有需要独立密钥时才填写 `app.agent.model.api-key`。然后在 PowerShell 中执行：

```powershell
$env:AIVISTA_JAVA_LOCAL_YAML = (Resolve-Path '..\backend\aivista\src\main\resources\application-local.yaml')
$env:RUN_AGENT_SMOKE = 'true'
pnpm test:agent-smoke
```

若同时验证 WebP图片输入，再设置：

```powershell
$env:AIVISTA_AGENT_SMOKE_IMAGE_PATH = 'C:\absolute\path\to\image.webp'
pnpm test:agent-smoke
```

测试覆盖纯文本流、Fake Tool Result进入下一 Turn、`agent_settled` 单次收尾，以及可选 WebP `ImageContent`。不要把真实 Key写入 `.env.example` 或提交到 Git。

真实百炼验证结果：`qwen3.8-flash` 文本流、Pi Tool Result 进入下一 Turn，以及 256×256 WebP `ImageContent` 均已通过。2×2 极小 WebP 会被模型拒绝，Smoke 应使用正常可识别尺寸；生产输入来自 OSS 展示图，不受该测试素材问题影响。完整本地 E2E 也已验证：无 Tool 的纯文本 Agent 正常结束；海报请求自动披露 `poster-design` Skill，分别调用正式 `text_to_image` 和带显式授权资产的 `image_to_image`，由同进程 Generation Worker 完成百炼与 OSS 转存，并由 Java 原子提交最终消息、Activity、Generation 与图片资产；两类结果图的签名 GET 均返回 `200 image/webp`。浏览器等价 SSE 客户端收到了 `RUN_STARTED → TEXT_STARTED → TEXT_DELTA → TEXT_FINISHED → RUN_FINISHED`。

## 本地运行

不需要 Docker。先以 `local` Profile 启动 Java，让 Flyway 创建或升级表，再启动对应 TS Worker：

Agent 功能需要 Java 与 TS 在同一次运行中都启用。若本地 YAML 仍保留 `app.agent.enabled: false`，可只为当前 PowerShell 进程临时覆盖，不必改写含真实密钥的本地文件：

```powershell
# Java 终端
$env:APP_AGENT_ENABLED = 'true'
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"

# TS 终端
$env:AIVISTA_AGENT_ENABLED = 'true'
$env:AIVISTA_JAVA_LOCAL_YAML = (Resolve-Path '..\backend\aivista\src\main\resources\application-local.yaml').Path
pnpm worker
```

首次安装或改动代码后，再执行以下完整质量门：

```powershell
$env:AIVISTA_JAVA_LOCAL_YAML = (Resolve-Path '..\backend\aivista\src\main\resources\application-local.yaml').Path
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm worker
```

`AIVISTA_JAVA_LOCAL_YAML` 只读取 Java 本地配置（包括内部 Worker Token）；显式 TS 环境变量优先，代码不会复制或输出密钥。
