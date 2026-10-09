<h1 align="center">AiVista</h1>

<p align="center">从灵感发现到 Agent 创作、资产管理与社区发布的全栈 AI 图像创作平台。</p>

<p align="center">
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&amp;logoColor=white" alt="TypeScript 5"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&amp;logoColor=white" alt="React 19"></a>
  <a href="https://spring.io/projects/spring-boot"><img src="https://img.shields.io/badge/Spring_Boot-4.1-6DB33F?logo=springboot&amp;logoColor=white" alt="Spring Boot 4.1"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22%2B-5FA04E?logo=nodedotjs&amp;logoColor=white" alt="Node.js 22+"></a>
  <a href="https://github.com/earendil-works/pi"><img src="https://img.shields.io/badge/Pi_Agent-0.83.0-7C3AED" alt="Pi Agent 0.83.0"></a>
  <a href="https://www.rabbitmq.com/"><img src="https://img.shields.io/badge/RabbitMQ-FF6600?logo=rabbitmq&amp;logoColor=white" alt="RabbitMQ"></a>
  <a href="https://www.meilisearch.com/"><img src="https://img.shields.io/badge/Meilisearch-FF5CAA?logo=meilisearch&amp;logoColor=white" alt="Meilisearch"></a>
</p>

AiVista 是由 [superzheng777](https://github.com/superzheng777) 独立设计并实现的个人项目，覆盖产品交互、Web 前端、Java Core、TypeScript AI Runtime 以及服务间协议。

[为什么做 AiVista](#为什么做-aivista) · [核心能力](#核心能力) · [产品展示](#产品展示) · [Agent 与内置 Skill](#agent-与内置-skill) · [系统架构](#系统架构) · [本地运行](#本地运行) · [项目文档](#项目文档)

![AiVista 灵感探索页面，展示作品瀑布流、搜索入口和左侧主要导航](docs/frontend/design/pic/show/explore.png)

灵感探索页聚合社区公开作品，支持浏览、搜索和进入创作者主页，也是创作流程的主要入口。

## 为什么做 AiVista

灵感出现时，往往还不是一句完整的提示词。它可能是一张参考图、一种氛围，或者一个说不清的画面。真正把它做成作品，还要逐渐明确主题和约束、选择视觉方向、查看并筛选生成结果，再把满意的图片整理起来，继续创作或公开分享。

AiVista 面向希望用 AI 把视觉想法做成作品的个人创作者。我想把这段常被拆开的过程接起来：从社区作品中寻找灵感，用直接生成或 Agent 协作完成创作，再把结果收进个人资产，并发布到社区。方向明确时，用户可以自己控制提示词、参考图、画幅和数量；想法还模糊时，Agent 会借助对应 Skill 追问关键问题，把没有说完整的意图整理成可执行的视觉方案。

我希望 AiVista 能接住一个念头从出现、成形到成为作品的过程。Agent 可以理解需求和执行工具，作品往哪里走、最终留下哪一张，仍由创作者决定。

## 核心能力

- 从公开灵感、关键词搜索和创作者主页进入文生图或图生图，再将结果沉淀为个人资产并发布到社区。
- 同时提供直接生成与 Agent 模式。Agent 可以结合对话上下文和八个内置 Skill 工作；信息不足时生成可恢复的确认表单，用户提交或跳过后继续，也可以取消整次创作。
- 支持个人资产、收藏、关注、点赞、通知和创作者主页等社区能力。
- 创作由 TS 在 Node 内异步调度，只有图片生成进入 RabbitMQ 削峰；资产与额度在同一事务结算，社区待办沿用 Java Outbox。
- 原始图片存放在私有 OSS，按使用场景生成缩略图、展示图和原图访问地址。

## 产品展示

首屏展示灵感探索页，下面依次展示 AI 创作、资产管理和个人主页三个主要工作区。

### AI 创作

从新建页选择直接生成或 Agent 模式，输入创作目标，并在左侧继续查看历史会话。

![AiVista AI 新对话创作页面，展示直接生成与 Agent 模式入口](docs/frontend/design/pic/show/new_generation.png)

Agent 回复分为可折叠的 创作过程、可折叠的表单操作记录、最终回复和图片区域；过程包含每次公开文字、工具名称及合并计数，不显示工具行右侧状态。工具条目不可展开，接口不传工具参数和详细结果。可以继续调整作品或进入资产库。

![AiVista Agent 创作会话，展示 Skill 加载、需求确认、创作过程和海报结果](docs/frontend/design/pic/show/generation.png)

### 资产管理

集中查看个人生成结果，并按状态筛选或执行下载、发布和删除等操作。

![AiVista 资产管理页面，展示个人作品列表、筛选导航和资产操作入口](docs/frontend/design/pic/show/assets.png)



### 资产详情

![AiVista 图片详情](docs/frontend/design/pic/show/asset_detail.png)



### 个人主页

汇总创作者资料、关注关系和公开作品，将创作记录与社区身份连接起来。

![AiVista 个人主页，展示创作者资料、关注数据和公开作品](docs/frontend/design/pic/show/user.png)

## Agent 与内置 Skill

AiVista Agent 先判断任务是否匹配已有 Skill，匹配时先读取，再根据方法与已有信息决定是否需要需求确认表单。每次模型回复最多调用一个工具，等待结果后再决定下一步；信息已经充分时直接创作。Skill 定义需求收集、创作方法和检查项；实际图片读取、生成和表单交互仍受工具 Schema 与运行时校验约束。

| Skill | 适用任务 |
| --- | --- |
| [`poster-design`](backend-ts/.pi/skills/poster-design/SKILL.md)（海报设计） | 设计活动主视觉、宣传主图等单画布海报，保护既定文案并建立信息层级。 |
| [`brand-design`](backend-ts/.pi/skills/brand-design/SKILL.md)（品牌设计） | 从品牌、业务和受众信息中提炼定位，形成 Logo 概念与配套视觉方向。 |
| [`cinematic-still`](backend-ts/.pi/skills/cinematic-still/SKILL.md)（电影感摄影） | 用户明确要求叙事电影剧照或连续镜头时使用，组织机位、光线和连续性。 |
| [`impasto-diorama`](backend-ts/.pi/skills/impasto-diorama/SKILL.md)（油彩立体厚涂） | 将已授权照片重构为摄影与厚涂结合的立体微景观。 |
| [`monumental-scale-poster`](backend-ts/.pi/skills/monumental-scale-poster/SKILL.md)（巨物尺度清透海报） | 用户明确选择巨物清透风格时使用，不作为普通海报的默认方法。 |
| [`portrait-face-director`](backend-ts/.pi/skills/portrait-face-director/SKILL.md)（人像捏脸） | 用户要求脸谱或五官设计时使用，按需确认；仅明确要求分阶段捏脸时分两阶段。 |
| [`japanese-life-fragments`](backend-ts/.pi/skills/japanese-life-fragments/SKILL.md)（日系生活碎片） | 将每张已授权照片分别转译为摄影与亚克力场景图结合的竖版海报。 |
| [`series-image-director`](backend-ts/.pi/skills/series-image-director/SKILL.md)（系列套图导演） | 设计统一母版下具有结构变化的套图，不用于同一提示词的多张随机候选。 |

完整触发条件和工作流见各 Skill 的 `SKILL.md`；运行机制与权限边界见 [Agent 模式设计](docs/architecture/Agent模式.md) 和 [TypeScript AI Runtime 文档](docs/worker/AI-Runtime.md)。

## 系统架构

生成请求由 Java Core 完成鉴权和输入图片授权，再通过内部 HTTP 交给 TS AI Runtime。TS 持久化创作后，在 Node 内直接异步执行普通流程或 Pi Agent；普通生成和 Agent 生图工具统一创建图片任务，通过 RabbitMQ 削峰，再调用图片模型、转存和结算。每个会话共享一份原生 Pi JSONL 文件。

```mermaid
flowchart LR
    browser["Browser<br/>Next.js"] -->|"REST"| core["Java Core API<br/>Spring Boot"]
    core --> business[("MySQL<br/>执行、资产与社区数据")]
    core --> search[("Meilisearch")]
    core -->|"鉴权后的内部 HTTP"| runtime["TypeScript AI Runtime<br/>NestJS + Pi Agent"]
    runtime -->|"图片任务"| rabbit["RabbitMQ<br/>Quorum Queue"]
    rabbit -->|"单消费者 · prefetch 200"| images["TS 图片执行器"]
    images -->|"图片结果"| runtime
    runtime -->|"执行与结算事务"| business
    runtime --> sessions[("Pi JSONL<br/>完整会话记录")]
    runtime -->|"Agent 文本与视觉推理"| bailian["阿里云百炼"]
    images -->|"图片请求 · 最多 2 次/秒"| bailian
    images -->|"资产、额度与终态事务"| business
    images -->|"私有对象"| oss["阿里云 OSS"]
    runtime -. "HTTP 实时事件" .-> core
    core -. "SSE" .-> browser
```

Java 与 TS 连接同一个 MySQL 库；生成结算由 TS 负责，资产管理和社区操作由 Java 负责。图中的 Runtime 和图片执行器运行在同一个 TS 进程。会话内容保存在持久化的 Pi JSONL 中，SQL 保存会话索引、执行状态和图片结果。浏览器直接把 SSE 事件合入当前会话缓存，断线后通过 REST 历史恢复。

## 关键工程取舍

- **创作本地调度：** 创作持久化或表单回答后唤醒 Node 调度器，启动与周期扫描补启动 QUEUED 创作，同一会话保持串行。
- **图片削峰：** TS 扫描尚未派发的 QUEUED 图片任务，向 RabbitMQ quorum queue 发布，确认后记录派发时间。单消费者 `prefetch=200` 覆盖等待限速、模型调用、转存和结算；请求启动最多每秒 2 次，没有额外的模型并发门槛。
- **消费与结算幂等：** 图片任务通过状态和 revision 原子领取，结果可靠落库后逐条 ACK；异步等待期间仍可处理其他消息。已持久化的模型响应用于重试转存，结果不确定的付费调用不自动重放。
- **实时与历史共用协议：** TS 经内部 HTTP 将过程事件交给 Java，再由 SSE 更新浏览器的 turns/items；历史加载返回相同结构。
- **受控的 Agent 执行：** 工具白名单、可信会话图片、轮数上限和取消信号限制执行范围。需要用户确认时保存原生表单记录并进入 WAITING_INPUT，本次 Pi 执行随即结束；回答追加到同一会话后恢复原创作。
- **可选运行追踪：** Langfuse 与 OpenTelemetry 默认关闭。观测失败不会改变业务状态，记录内容会省略图片二进制、模型思考内容和签名信息。
- **私有图片访问：** OSS 保存私有源文件和派生变体，浏览器只获得与当前用途匹配的短期签名 URL。

更细的状态机、恢复语义和消息契约放在[项目文档](#项目文档)中，README 只保留跨模块的关键决定。

## 技术栈

| 职责 | 技术 |
| --- | --- |
| Web | Next.js、React、TypeScript、Tailwind CSS、TanStack Query、Zustand |
| Java Core | Java、Spring Boot、Spring Security、MyBatis-Flex、Flyway |
| AI Runtime | NestJS、TypeScript、Pi Agent SDK、阿里云百炼、Langfuse / OpenTelemetry（可选） |
| 基础设施 | MySQL、RabbitMQ、Meilisearch、阿里云 OSS |

## 项目结构

```text
AiVista/
├── frontend/aivista/              # Next.js Web 应用
├── backend/aivista/               # Java Core 与数据库迁移
├── backend-ts/                    # AI Runtime、异步 Worker 与 .pi/skills
└── docs/                          # 架构、模块、视觉与文档规范
```

## 本地运行

以下命令以 Windows PowerShell 为例。开始前需要准备 Node.js 22.19+、pnpm 10、Java 25，以及可访问的 MySQL、RabbitMQ 和 Meilisearch。完整图像生成还需要有效的阿里云百炼和 OSS 配置。

```powershell
git clone https://github.com/superzheng777/AiVista.git
cd AiVista
```

### 1. 启动 Java Core

复制[本地配置模板](backend/aivista/src/main/resources/application-local.example.yaml)，填写数据库、RabbitMQ、Meilisearch、百炼、OSS 和 JWT 配置。将下方令牌占位符替换为仅在本机使用的随机值，不要向 Git 提交真实凭证。Flyway 在空库依次执行 V1 基础表、V2 图片任务和 V3 会话逻辑删除迁移。本轮用户统计与通知改造按已确认的开发数据重置方案更新了 V1；旧开发库必须先重置后初始化，不能仅执行后续迁移或用 repair 忽略校验差异。需要保留数据的其他环境应另行提供增量迁移，详见[用户统计与通知去重模块](docs/java/modules/用户统计与通知去重模块.md)。

已有环境升级须先停止 TS，再启动 Java 执行迁移，最后启动新 TS。V2 对既存运行中图片任务保守标记，避免恢复时再次调用模型；详细步骤见 [AI Runtime](docs/worker/AI-Runtime.md)。

```powershell
cd backend/aivista
Copy-Item .\src\main\resources\application-local.example.yaml .\src\main\resources\application-local.yaml
$env:AIVISTA_GENERATION_WORKER_TOKEN = '<local-shared-worker-token>'
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
```

Java Core 默认运行于 `http://localhost:8888/api`。

### 2. 启动 TypeScript AI Runtime

在新的终端中执行：

```powershell
cd backend-ts
pnpm install
$env:AIVISTA_JAVA_LOCAL_YAML = (Resolve-Path '..\backend\aivista\src\main\resources\application-local.yaml').Path
$env:AIVISTA_GENERATION_WORKER_TOKEN = '<local-shared-worker-token>'
$env:AIVISTA_AGENT_ENABLED = 'true'
pnpm build
pnpm worker
```

Worker 复用 Java 本地配置，但不向浏览器提供 API。Java 与 Worker 必须使用相同的内部令牌。上述命令适用于 YAML 通过环境变量占位符取值；若本地 YAML 已固定填写 worker-api.token，应由 Worker 直接读取，不另设不同的 AIVISTA_GENERATION_WORKER_TOKEN。Agent 接收开关由 TS 控制：在 TS Worker 终端设置 `AIVISTA_AGENT_ENABLED=true`，并通过 `AIVISTA_JAVA_LOCAL_YAML` 读取同一份 Java 本地配置；Java 无需另设 Agent 开关。可选环境变量见 [`.env.example`](backend-ts/.env.example)，完整说明见 [AI Runtime 文档](docs/worker/AI-Runtime.md)。

### 3. 启动 Web

在第三个终端中执行：

```powershell
cd frontend/aivista
pnpm install
pnpm dev
```

浏览器访问 `http://localhost:3000`。开发环境默认将 `/api` 转发到 `http://localhost:8888`。若只查看不依赖模型的页面，可以仅启动 Java Core 与 Web；完整生成链路必须同时运行 AI Runtime，并确保外部服务和凭证可用。

## 测试与质量

下面每个代码块都从仓库根目录执行。Java 测试覆盖领域服务与数据访问，AI Runtime 测试覆盖消息契约、幂等行为和 Agent 执行，Web 测试覆盖状态模型、事件解析与关键组件。

Java Core：

```powershell
cd backend/aivista
.\mvnw.cmd test
.\mvnw.cmd test-compile failsafe:integration-test failsafe:verify
```

Java 集成测试读取 `application-local.yaml`，自动创建并删除独立的本地 MySQL 临时库，需要 CREATE/DROP DATABASE 权限；不会重置项目库，无需 Docker。

AI Runtime：

```powershell
cd backend-ts
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Web：

```powershell
cd frontend/aivista
pnpm install
pnpm lint
pnpm test
pnpm build
```

## 项目文档

- [完整文档导航](docs/README.md)：按架构、前端、Java、Worker 与规范查找文档。
- [前端项目开发文档](docs/frontend/前端项目开发文档.md)：页面模块、交互流程和工程边界。
- [Java Core 后端项目开发文档](docs/java/后端项目开发文档.md)：领域模块、基础设施和实现索引。
- [Agent 模式架构](docs/architecture/Agent模式.md)：会话、工具、事件投影、取消和一致性设计。
- [TypeScript AI Runtime](docs/worker/AI-Runtime.md)：Worker 配置、Pi Runtime、执行流程和质量门。
- [创作通信协议](docs/architecture/creation-protocol.md)：REST、SSE、内部 HTTP 与图片队列契约。

## 参与贡献

欢迎通过 [Issue](https://github.com/superzheng777/AiVista/issues) 报告问题，或通过 [Pull Request](https://github.com/superzheng777/AiVista/pulls) 提交范围清晰的修复。涉及架构、协议或数据模型的调整，建议先在 Issue 中说明背景和方案。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
