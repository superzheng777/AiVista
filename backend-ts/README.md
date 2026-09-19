# AiVista TypeScript AI Runtime

`backend-ts` 只运行 AI 与异步 I/O Worker，不提供浏览器 API。前端始终调用 Java Core；Java 保留认证、用户、社区、发布状态、通知、搜索、SSE、额度以及核心事务的所有权。

Java 已提供 `/agent-creations`，并通过同一个 Outbox/Direct Exchange 向独立的 `agent.creation.execute` Quorum Queue 派发最小 `AGENT_EXECUTE` 命令。TS 的独立 Agent Consumer 已接通执行快照、OSS→Pi `ImageContent`、短生命周期 Pi Session、Agent Ledger、实时 Activity 投影与幂等 Completion；首个 `poster-design` Skill 通过受限 `read` 按需披露正文。Agent 和 Generation Consumer 使用独立并发池。Pi 事件经 `AgentEventNormalizer` 聚合后，通过实例级 Java–TS WebSocket 和浏览器已有 SSE 实时显示；运行中的安全投影只保存在 Java 内存并可在 SSE 重连时用 `RUN_SNAPSHOT` 恢复，Loop 结束后由最终 Completion 一次性持久化不可变 Activity。最终状态由 Java 提交后通知前端重新读取 REST 快照。用户取消已采用 Java 权威事务、Java→TS WebSocket 控制帧、Pi `session.abort()`/Tool `AbortSignal` 和重连快照对账实现。

## 当前边界

- Java 使用事务 Outbox、Publisher Confirm 和持久 Quorum Queue 发布生成命令。
- TS Pipeline 连续完成百炼、下载和 OSS，再通过以 `generationTaskId + expectedRevision` 为条件的幂等 `PUT` 向 Java 提交最终结果。
- Java 的 `generation_tasks` 是唯一生成状态来源：`QUEUED → GENERATING → SAVING → SUCCEEDED/PARTIALLY_SUCCEEDED/FAILED`。TS 在调用百炼前和开始持久化图片前，通过内部 HTTP 上报两个中间阶段；Java提交后尽力通过既有 SSE 投影给浏览器。
- 普通生成不再使用 `generation_worker_executions`。TS 进程内 active task 集合阻止并发重复执行；重启后若权威任务已处于 `GENERATING/SAVING`，不猜测 Provider 是否已产生副作用，也不再次调用 Provider，而是以 `PROVIDER_CALL_OUTCOME_UNKNOWN` 失败收口。只有 revision 一致的 `QUEUED` 任务可以启动 Pipeline。
- TS 只消费一个生成命令；旧 Transfer Queue、Worker Result Queue、分段消费者和运行切换开关均已删除。
- 排队超时和资产清理由 Java 保留，因为它们会修改 Java 拥有的业务状态。
- 发布审核属于 Java 发布领域，由 Java 完成审核调用、状态、通知与失败恢复；TS 不参与。
- Agent Runtime 按 Java、TS 各单实例的边界实现，不引入跨实例租约。主模型固定为支持图片输入与 Function Calling 的百炼 `qwen3.8-flash`；`qwen-image-2.0` 只承担实际图片生成。一次 Creation 创建一个短生命周期、`SessionManager.inMemory(explicitCwd)` 的 Pi Session 和最多 20 Turn 的 Loop；Generation Session 是 MySQL 中的跨轮逻辑会话。每轮从 Execution Snapshot V2 恢复 `agent_session_contexts` 中的 Pi 逻辑上下文，使用 Pi `SettingsManager` 原生自动压缩，并在成功 Completion V2 中由 Java原子保存新 Context。Context保留近期完整 Tool Call/Result，但导出前会把图片二进制替换为 Asset ID引用；不保存 Data URI、Pi JSONL、Thinking 或逐 Token。共享 ModelRuntime、受控 ResourceLoader、系统提示词、active Tool 白名单、内联 Harness Extension 和事件 Adapter 构成 Runtime 外壳。Assistant 有 Tool Call时由 Pi执行并继续，没有 Tool Call且有文字时自然结束。Tool 等待同进程 Generation Worker，Completion 被 Java确认后由单 Waiter Coordinator 唤醒。`poster-design` 已按 Pi 的 Skill 索引→受限 `read`→正文渐进披露链路接通；`read` 不能越过 `.pi/skills`。内部 WebSocket只传实时文字、Tool 进度、取消和心跳。Agent Creation 支持 `AUTO/0` 或用户指定的画幅与总数量约束；约束通过执行快照注入 Pi。每次 Tool 的 `imageCount` 支持 1～6，同方向可单任务多图，不同方向可拆为多个 Tool。详见 `../backend/aivista/Agent模式模块.md`。

共享线协议位于 `../contracts/generation-worker/v1`。

单命令 Pipeline 已完成切换：Java completion 接口、真实文生图和图生图均已验证；旧 Transfer/Result MQ 代码以及 `generation_tasks` 的 Provider 快照、Transfer 时间字段由 Flyway V19 清理。普通 Generation Worker 不再维护数据库 Ledger，只用进程内 active 集合阻止同进程并发重复执行；任务阶段和终态都以 Java `generation_tasks` 为权威。

Agent Runtime 当前实现：中文系统提示词位于 Pi 原生 `.pi/SYSTEM.md`；Provider 位于 `src/agent/providers/`，正式 `text_to_image` / `image_to_image` / `inspect_image` 位于 `src/agent/tools/` 并由 `index.ts` 汇总。`agent-context.ts` 负责 Pi Context 的校验、恢复、active branch 导出与图片二进制清理；最多 20 Turn 的 Harness 和 Pi 原生文本事件投影已完成。当前请求图片按顺序注入为 `ImageContent`，同时在本轮受信任系统上下文中绑定准确 Asset ID；历史 Context 只保存 Asset ID，模型确需理解历史图片时可调用 `inspect_image`，由 Java按当前用户、Generation Session、Creation 状态和 revision 授权后，TS从 OSS恢复为一次性的 Pi `ImageContent`。Tool Result进入下一 Turn 后，持久化 Codec再次移除图片 Base64，只保留稳定 Asset ID。`text_to_image` 与 `image_to_image` 已通过本地 Faux Provider验证 Tool Call → Tool Result → 下一 Turn，并通过真实端到端文生图、图生图验证；Faux 只存在于测试。`AgentGenerationToolExecutor` 使用 Pi `toolCallId` 幂等创建 Java Generation Task，由同进程单 Waiter `GenerationCompletionCoordinatorService` 等待 Java已提交的权威结果。独立 Agent Consumer 读取 Java快照、运行 Pi、先保存可重放 Ledger Completion，再提交 Java；只有 Java事务确认最终消息、Activity、Context 与 Creation 后才 ACK。

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
