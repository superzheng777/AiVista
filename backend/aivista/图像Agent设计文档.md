# AiVista 图像 Agent 设计文档

> 文档类型：图像 Agent 架构设计\
> 当前状态：方案设计中\
> 适用范围：AiVista 图像生成模块\
> 设计目标：在现有普通图像生成能力基础上，引入 Agent
> 模式，并统一支持文生图、图生图与图像编辑。

------------------------------------------------------------------------

## 1. 背景

AiVista 当前已具备普通图像生成能力，现阶段主要由用户输入
Prompt、配置生成参数并直接发起图像生成任务。

后续生成模块需要同时向两个方向扩展：

1.  普通模式补充图生图、图像编辑能力；
2.  新增 Agent 模式，使用户可以通过自然语言描述创作目标，由 Agent
    自动理解目标、制定执行方案、选择图像能力并完成多步骤创作。

因此，文生图、图生图、图像编辑不能被定义为 Agent 独有能力，而应该下沉为
AiVista 统一的图像能力层，由普通模式和 Agent 模式共同复用。

Agent 的本质不是新的图像模型，而是建立在图像能力之上的创作编排层。

------------------------------------------------------------------------

## 2. 设计目标

AiVista Image Agent 的核心目标是：

> 用户描述"希望完成什么创作目标"，Agent
> 负责理解目标、选择合适能力、规划执行步骤、调用图像模型，并在多轮会话中继续围绕已有图片进行创作。

普通模式与 Agent 模式的区别应明确为：

``` text
普通模式：
Human
  ↓
选择操作
  ↓
配置参数
  ↓
Image Capability
  ↓
Image Model

Agent 模式：
Human
  ↓
Creative Goal
  ↓
Agent
  ↓
Plan / Skill / Tool
  ↓
Image Capability
  ↓
Image Model
```

普通模式由用户决定"调用什么能力以及如何调用"。

Agent 模式由 Agent
根据用户目标决定"调用什么能力、调用顺序以及如何组合"。

------------------------------------------------------------------------

## 3. 核心设计原则

### 3.1 图像能力与 Agent 解耦

文生图、图生图、图像编辑属于统一底层能力，不分别为普通模式与 Agent
模式重复实现。

统一形成：

``` text
Image Capability Layer

├── Text-to-Image
├── Image-to-Image
├── Image Editing
└── Image Analysis
```

普通模式直接调用该层。

Agent 通过 Tool 调用该层。

------------------------------------------------------------------------

### 3.2 Agent 不直接调用模型

Agent LLM 不直接负责：

-   调用具体模型 API；
-   访问数据库；
-   写入 OSS；
-   管理异步任务；
-   决定底层供应商参数。

Agent 主要负责：

-   理解；
-   判断；
-   规划；
-   选择；
-   重新规划。

所有具有副作用的操作均通过 Tool 和 Execution Engine 执行。

------------------------------------------------------------------------

### 3.3 Tool、Skill、Agent 三层职责分离

必须明确：

``` text
Agent ≠ Skill ≠ Tool
```

定义如下：

``` text
Agent
  ↓
Skill / Direct Plan
  ↓
Workflow
  ↓
Tool
  ↓
Image Capability
  ↓
Model
```

Tool 是原子能力。

Skill 是针对某类创作目标封装的专业工作流。

Agent 负责理解用户目标，并决定直接调用 Tool，还是选择 Skill。

------------------------------------------------------------------------

### 3.4 Agent 不建立第二套图片资产系统

Agent 最终生成的图片仍然属于 AiVista 现有图片资产。

因此：

``` text
普通模式
    │
    └── generation_images

Agent 模式
    │
    └── generation_images
```

不新增 `agent_images` 等独立图片实体。

Agent 只增加：

-   Agent 会话；
-   Agent 执行；
-   Agent Step；
-   Artifact 关系；
-   Tool Call；

等编排相关领域对象。

------------------------------------------------------------------------

## 4. 总体架构

推荐采用：

> Planner-Executor + Skill-based Agent + DAG/State-machine Execution +
> Controlled Replan

整体结构如下：

``` text
                         User
                           │
                           ▼
                  ┌─────────────────┐
                  │  Agent Session  │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Orchestrator   │
                  │      LLM        │
                  └────────┬────────┘
                           │
                     Intent Resolve
                           │
               ┌───────────┴───────────┐
               │                       │
               ▼                       ▼
         Direct Action             Complex Goal
               │                       │
               ▼                       ▼
             Tool                  Planner
                                       │
                               ┌───────┴───────┐
                               ▼               ▼
                             Skill         Tool Plan
                               │               │
                               └───────┬───────┘
                                       ▼
                              Workflow Engine
                                       │
                              State Machine
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
           analyze_image       generate_image       edit_image
                  │                    │                    │
                  └────────────────────┼────────────────────┘
                                       ▼
                            Image Capability Layer
                                       │
                                       ▼
                                Model Adapter
                                       │
                                       ▼
                           Image / Vision Models
                                       │
                                       ▼
                             Generation Tasks
                                       │
                                       ▼
                                 Image Assets
```

------------------------------------------------------------------------

## 5. Agent V1 能力范围

第一版 Agent 重点支持：

-   文本创作目标理解；
-   单张或多张参考图片；
-   文生图；
-   图生图；
-   图像编辑；
-   图片内容分析；
-   多步骤执行；
-   多轮继续创作；
-   上下文图片指代；
-   图片版本与衍生关系；
-   简单 Skill 工作流。

第一版暂不重点实现：

-   Multi-Agent；
-   无限自主循环；
-   多轮自动 Critic / Reflection；
-   长周期自主任务；
-   联网自动搜索素材；
-   数十种垂直 Skill；
-   大规模长期 Memory；
-   Agent 自主选择任意底层模型参数；
-   用户在 AgentRun 执行过程中发送新的创作指令并修改当前 Plan。

V1 保留 **Agent 自主、受控的 Replan**：只有系统定义的 Replan
条件满足时，Agent 才允许调整尚未执行的后续计划；用户不能通过中途消息触发
Replan，执行期间仅允许取消当前任务。

------------------------------------------------------------------------

## 6. Tool Layer

Agent V1 建议首先提供四个核心 Tool。

### 6.1 analyze_image

作用：

对输入图片进行视觉分析，为 Planner 或后续生成提供结构化视觉信息。

示意：

``` text
analyze_image(image)
```

典型输出可以包括：

``` text
subject
style
composition
color
material
background
text
salient_features
```

典型场景：

``` text
用户上传产品图
  ↓
analyze_image
  ↓
识别主体、材质、颜色和核心特征
  ↓
Planner 制定宣传图方案
```

该 Tool 通常由 VLM 实现。

------------------------------------------------------------------------

### 6.2 generate_image

作用：

执行文生图。

示意：

``` text
generate_image(
    prompt,
    negativePrompt,
    aspectRatio,
    count
)
```

适用于：

``` text
给我生成一张未来感新能源汽车广告。
```

------------------------------------------------------------------------

### 6.3 generate_from_image

作用：

以已有图片作为参考进行新图生成。

示意：

``` text
generate_from_image(
    sourceImage,
    prompt,
    strength,
    aspectRatio,
    count
)
```

适用于：

``` text
参考这张人物，生成一个赛博朋克街道场景。
```

------------------------------------------------------------------------

### 6.4 edit_image

作用：

对指定已有图片进行指令式修改。

示意：

``` text
edit_image(
    image,
    instruction,
    mask?
)
```

适用于：

``` text
把第二张图片的天空改成夕阳。
```

或：

``` text
把人物移动到左侧。
```

是否进一步拆分：

-   inpainting；
-   outpainting；
-   object replacement；
-   background replacement；

第一版暂不需要在 Agent Tool 层暴露，可以由 `edit_image` 内部继续抽象。

------------------------------------------------------------------------

## 7. Tool 与底层 Image Capability 的关系

Tool 是 Agent 可调用接口。

Image Capability 是系统内部真正实现能力的服务。

例如：

``` text
Agent
  ↓
generate_image Tool
  ↓
ImageGenerationService
  ↓
ModelAdapter
  ↓
Qwen / Seedream / Other Provider
```

普通模式可以直接走：

``` text
普通生成页面
  ↓
ImageGenerationService
```

而不是经过 Agent Tool。

因此：

``` text
普通模式和 Agent 模式
共享 Capability
但不共享上层交互流程。
```

------------------------------------------------------------------------

## 8. Skill Layer

Skill 不等于 Tool。

Skill 是针对某类创作任务预定义的高层工作流。

例如：

``` text
Product Campaign Skill
```

可以定义：

``` text
Step 1
analyze_image(product)

Step 2
generate_from_image
生成白底产品主图

Step 3
generate_from_image
生成环境场景图

Step 4
generate_from_image
生成细节图

Step 5
generate_from_image
生成广告图
```

Agent 不需要每次从零推理整个流程。

对于已经比较成熟、重复出现的创作任务，应优先通过 Skill 约束执行。

------------------------------------------------------------------------

## 9. Agent V1 Skill 建议

第一版不建议建设过多 Skill。

可以优先考虑：

### 9.1 general_creation

通用创作。

适用于无法匹配明确垂直场景的复杂请求。

------------------------------------------------------------------------

### 9.2 image_variation

围绕现有图片生成多个变体。

例如：

``` text
基于这张图片给我做三个不同场景版本。
```

------------------------------------------------------------------------

### 9.3 image_editing

围绕已有图片进行连续修改。

例如：

``` text
把背景改成夜晚，然后调整成横版构图。
```

------------------------------------------------------------------------

### 9.4 creative_set

围绕一个主题生成成组视觉内容。

例如：

``` text
帮我做一套咖啡新品宣传图。
```

后续再扩展：

``` text
product_campaign
poster_design
character_series
social_media_pack
brand_visual
```

等垂直 Skill。

------------------------------------------------------------------------

## 10. Agent 请求路由

不是所有用户请求都需要 Planner。

应首先进行意图解析。

``` text
User Message
     │
     ▼
Intent Resolution
     │
     ├──────── Simple Action
     │               │
     │               ▼
     │             Tool
     │
     └──────── Complex Goal
                     │
                     ▼
                  Planner
                     │
            ┌────────┴────────┐
            ▼                 ▼
          Skill           Tool Plan
```

### 简单请求

例如：

``` text
再生成两张。
```

可以直接调用：

``` text
generate_image
```

例如：

``` text
第二张背景换成夜晚。
```

可以直接调用：

``` text
edit_image
```

------------------------------------------------------------------------

### 复杂请求

例如：

``` text
帮我做一套小红书咖啡新品宣传图。
```

则进入：

``` text
Planner
  ↓
Skill / Tool Plan
  ↓
Executor
```

这样可以降低：

-   LLM 调用次数；
-   Token 成本；
-   延迟；
-   规划错误；
-   工具误调用。

------------------------------------------------------------------------

## 11. Planner 与 AgentPlan

Planner 的职责是：

``` text
Creative Goal
  ↓
Structured AgentPlan
```

Planner
不应主要输出自然语言执行说明，而应输出可校验、可执行、可版本化的结构化
Plan。

示意：

``` json
{
  "planVersion": 1,
  "goal": "create_product_visuals",
  "steps": [
    {
      "id": "step_1",
      "action": "analyze_image",
      "dependsOn": [],
      "input": {
        "image": "user_upload_001"
      }
    },
    {
      "id": "step_2",
      "action": "generate_from_image",
      "dependsOn": ["step_1"],
      "input": {
        "source": "user_upload_001",
        "concept": "minimal studio advertisement"
      }
    },
    {
      "id": "step_3",
      "action": "generate_from_image",
      "dependsOn": ["step_1"],
      "input": {
        "source": "user_upload_001",
        "concept": "urban street advertisement"
      }
    }
  ]
}
```

Planner 负责描述：

-   目标；
-   Step；
-   Step 依赖；
-   Tool 类型；
-   高层输入；
-   前序结果引用；
-   可执行的 DAG 结构。

Planner 不应随意控制：

-   模型供应商；
-   CFG；
-   sampler；
-   seed；
-   内部系统 Prompt；
-   底层超时；
-   OSS 路径；
-   数据库字段；
-   最终资源预算。

这些由系统策略、Policy Validator 与 Tool Adapter 决定。

------------------------------------------------------------------------

## 12. Step DAG、并行与结果引用

### 12.1 Step 是否允许并行

允许，但并行必须建立在显式依赖关系上。

原则：

> 有数据依赖则串行；没有数据依赖的 Step 可以并行。

例如：

``` text
             step_1 analyze_image
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       step_2      step_3      step_4
       极简风       街头风       科技风
```

`step_2`、`step_3`、`step_4` 都依赖 `step_1`，但彼此没有依赖，因此
Executor 可以并行调度。

Step 通过 `dependsOn` 显式声明依赖：

``` json
{
  "id": "step_3",
  "dependsOn": ["step_1"]
}
```

Executor 只负责根据 DAG 判断哪些 Step 当前可运行，不自行推断创作依赖。

------------------------------------------------------------------------

### 12.2 后续 Step 如何引用前序图片

Planner 生成 Plan 时，后续图片通常尚未产生，因此不能直接引用真实
`imageId`、OSS 地址或签名 URL。

统一使用逻辑结果引用：

``` json
{
  "type": "STEP_OUTPUT",
  "stepId": "step_1",
  "outputKey": "images",
  "index": 1
}
```

语义等价于：

``` text
step_1.images[1]
```

执行时由 Executor 完成解析：

``` text
StepOutputRef
     ↓
Artifact
     ↓
imageId
     ↓
实际图片资源
```

因此：

-   Plan 只保存逻辑引用；
-   Artifact 保存 Agent 上下文中的图片关系；
-   `generation_images` 仍保存真实图片资产；
-   Planner 不接触 OSS URL 或短期签名 URL。

------------------------------------------------------------------------

## 13. Executor、失败传播与执行预算

Executor 不负责创作推理，它负责可靠执行已经确认的 AgentPlan。

主要职责：

-   DAG Step 调度；
-   Step 状态管理；
-   并行执行；
-   Tool 调用；
-   参数解析；
-   `StepOutputRef / ArtifactRef` 解析；
-   超时；
-   重试；
-   失败传播；
-   取消；
-   执行预算校验；
-   执行日志；
-   状态持久化。

即：

``` text
Planner
负责决定做什么

Executor
负责可靠地执行
```

### 13.1 Step 失败策略

V1 不采用"任意 Step 失败即整个 Run
失败"的简单策略，而是按照依赖关系传播。

例如：

``` text
             analyze
                │
        ┌───────┼───────┐
        ▼       ▼       ▼
        A       B       C
        ✓       ×       ✓
```

如果 B 与 A、C 相互独立，则 A、C 可以继续完成，AgentRun 可以进入
`PARTIALLY_COMPLETED`。

如果：

``` text
step_1 FAILED
   │
   └── step_2 depends on step_1
```

则：

``` text
step_1 = FAILED
step_2 = SKIPPED
```

如果已经不存在有意义的可执行分支，则 AgentRun 进入 `FAILED`。

因此原则是：

> Step 失败沿依赖关系传播；不受影响的独立分支继续执行。

------------------------------------------------------------------------

### 13.2 Execution Budget

Planner 不能无限创建 Step 或生成任务。

Executor 执行前必须通过统一 Policy 校验执行预算。

建议至少包含：

``` text
ExecutionBudget

├── maxSteps
├── maxGenerationTasks
├── maxGeneratedImages
├── maxReplans
└── maxDuration
```

V1 可以先使用保守的默认值，例如：

``` text
maxSteps = 8
maxGenerationTasks = 6
maxGeneratedImages = 12
maxReplans = 2
maxDuration = 待定
```

具体数值后续根据模型成本、响应时间和用户体验调整。

核心原则：

> Planner 负责提出计划；Policy / Executor 决定该计划是否允许执行。

------------------------------------------------------------------------

## 14. Controlled Replan

AiVista V1 保留 Replan，但不采用逐 Step 的 ReAct 循环。

推荐模式：

> Initial Plan + 特定条件触发的受控 Replan。

整体：

``` text
Initial Plan
     │
     ▼
DAG Executor
     │
     ├── 正常执行 ─────────────→ Continue
     │
     └── 满足 Replan 条件
                 │
                 ▼
             Replanner
                 │
                 ▼
              Plan V2
                 │
                 ▼
              Executor
```

### 14.1 Replan 的触发来源

Replan 只能由系统执行过程触发，而不是由用户执行中途发送新消息触发。

典型触发条件包括：

-   图片分析结果提供了初始规划阶段无法获得的关键视觉信息；
-   某个 Tool 执行失败，但存在可替代的执行路径；
-   某一步输出使原 Plan 的后续前提不再成立；
-   Skill 明确定义了需要阶段性重新规划的检查点。

不采用：

``` text
每执行一个 Step
  ↓
LLM 再思考一次
  ↓
再规划下一步
```

即 V1 不做无限 ReAct。

------------------------------------------------------------------------

### 14.2 Replan 修改边界

Replan 只能影响尚未执行的未来计划。

允许：

-   修改 `PENDING` Step；
-   删除 `PENDING` Step；
-   新增 Step；
-   调整未来 Step 的依赖关系。

不允许：

-   修改 `RUNNING` Step 已经发生的执行事实；
-   修改 `SUCCEEDED` Step；
-   修改 `FAILED` Step 的历史结果；
-   删除已经产生的 Artifact；
-   假装已经发生的 Tool Call 不存在。

因此 Plan 必须版本化：

``` text
Plan V1
   ↓
执行部分 Step
   ↓
Replan
   ↓
Plan V2
```

每次 Replan 应记录：

-   `planVersion`；
-   触发原因；
-   触发时间；
-   被替换或新增的未来 Step；
-   对应 AgentRun。

------------------------------------------------------------------------

### 14.3 Replan 次数限制

Replan 属于 Execution Budget 的一部分。

例如：

``` text
maxReplans = 2
```

超过预算后，不允许继续自主扩展执行链路，应根据当前结果结束为：

-   `COMPLETED`；
-   `PARTIALLY_COMPLETED`；
-   `FAILED`。

具体结束规则后续在 Executor 设计中进一步确定。

------------------------------------------------------------------------

## 17. State Machine

AgentRun 第一版使用明确的状态机。

### 15.1 AgentRun 状态

建议：

``` text
CREATED
PLANNING
EXECUTING
REPLANNING
CANCELLING
COMPLETED
PARTIALLY_COMPLETED
FAILED
CANCELLED
```

不再设置 `WAITING_USER`。

原因：

> 一个 AgentRun 一旦开始执行，用户不能通过新的创作消息修改当前
> Plan；执行期间用户唯一允许的控制动作是取消。

基本状态：

``` text
CREATED
   │
   ▼
PLANNING
   │
   ▼
EXECUTING
   │
   ├──────────────→ REPLANNING
   │                    │
   │                    ▼
   │                EXECUTING
   │
   ├──────────────→ COMPLETED
   │
   ├──────────────→ PARTIALLY_COMPLETED
   │
   ├──────────────→ FAILED
   │
   └──────────────→ CANCELLING
                         │
                         ▼
                     CANCELLED
```

------------------------------------------------------------------------

### 15.2 AgentStep 状态

建议：

``` text
PENDING
RUNNING
SUCCEEDED
FAILED
SKIPPED
CANCELLED
```

------------------------------------------------------------------------

### 15.3 用户执行期间的行为

AgentRun 处于 `PLANNING / EXECUTING / REPLANNING` 时：

``` text
不接受新的创作指令
只允许 Cancel
```

UI 可以表现为：

``` text
Agent 正在执行任务...

[取消任务]
```

用户不能通过：

``` text
“剩下的改成复古风”
```

修改当前 AgentRun。

如果用户希望修改目标，需要等待当前 Run 完成，或者取消当前
Run，然后重新发送新的创作指令并创建新的 AgentRun。

------------------------------------------------------------------------

### 15.4 Cancel 语义

用户点击取消后：

1.  AgentRun 进入 `CANCELLING`；
2.  Executor 不再调度新的 `PENDING` Step；
3.  尚未开始的 Step 标记为 `CANCELLED`；
4.  正在执行的 Tool / GenerationTask 如果底层支持取消，则尝试取消；
5.  如果底层不支持取消，则允许其自然结束，但不再驱动后续 Step；
6.  已经完成的 Step、Tool Call 和 Artifact 不回滚、不篡改。

当前倾向：

> 取消 AgentRun 时，已经成功生成并持久化的图片继续作为用户资产保留。

Cancel 表示停止后续 Agent 工作，而不是回滚已经完成的生成事实。

------------------------------------------------------------------------

## 16. Session 与 Run

建议：

``` text
一个 AgentSession
可以包含多个 AgentRun。
```

一个用户 Turn 对应一个独立 AgentRun。

AgentRun 执行期间不接收新的创作消息。当前 Run
结束后，用户的下一条创作消息创建新的
AgentRun；如果用户不希望等待，只能先取消当前 Run。

例如：

``` text
AgentSession

User:
帮我生成咖啡广告

AgentRun 1
├── analyze
├── generate
└── generate
```

之后：

``` text
User:
第二张背景换成晚上

AgentRun 2
└── edit
```

再之后：

``` text
User:
再做一个横版版本

AgentRun 3
└── generate_from_image
```

而不是让一个 AgentRun 无限存活。

因此：

``` text
AgentSession
   │
   ├── AgentRun 1
   │      ├── Step
   │      └── Step
   │
   ├── AgentRun 2
   │      └── Step
   │
   └── AgentRun 3
```

AgentSession 负责长期会话。

AgentRun 负责一次用户目标对应的一轮执行。

------------------------------------------------------------------------

## 17. Context 模型

Image Agent 的 Context 不能只有消息历史。

至少需要拆分为：

``` text
Conversation Context

Artifact Context

Execution Context
```

------------------------------------------------------------------------

## 18. Conversation Context

负责记录：

``` text
User Message
Assistant Message
```

用于理解：

-   用户当前目标；
-   用户上一轮反馈；
-   省略表达；
-   指令上下文。

------------------------------------------------------------------------

## 19. Artifact Context

Artifact 指 Agent 工作过程中可被引用的创作对象。

第一版主要就是图片。

Artifact Context 负责解决：

``` text
第二张不错。

把刚才那张背景换成雪山。

基于最开始那张重新生成。
```

等指代问题。

示意：

``` text
artifact
├── artifactId
├── imageId
├── sourceType
├── createdByRun
├── createdByStep
├── parentArtifactId
├── rootArtifactId
└── metadata
```

------------------------------------------------------------------------

## 20. Asset 与 Artifact 的区别

需要明确：

``` text
Image Asset
```

表示 AiVista 中用户拥有的图片资产。

``` text
Artifact
```

表示该图片在 Agent 创作上下文中的角色。

因此：

``` text
Image 是 Asset

Agent 使用 Image 时
该 Image 同时可以作为 Artifact
```

Artifact 不能替代现有 `generation_images`。

它只是对已有图片进行 Agent 关系建模。

------------------------------------------------------------------------

## 21. Artifact Lineage

Agent 需要记录图片衍生关系。

例如：

``` text
Image A
```

用户：

``` text
改成夕阳。
```

生成：

``` text
Image B
```

再：

``` text
加入一辆车。
```

生成：

``` text
Image C
```

关系：

``` text
A
└── B
    └── C
```

如果基于 A 重新生成另一个方向：

``` text
       A
      / \
     B   D
     |
     C
```

因此建议至少能够记录：

``` text
parentArtifactId
rootArtifactId
```

这样未来可以支持：

-   回到上一版本；
-   基于某个历史版本重新创作；
-   分支创作；
-   查看创作历史。

------------------------------------------------------------------------

## 22. Execution Context

Execution Context 负责记录系统执行状态。

例如：

``` text
Plan

step_1 analyze
SUCCEEDED

step_2 generate
SUCCEEDED

step_3 generate
RUNNING

step_4 generate
PENDING
```

该 Context 主要服务于：

-   Executor；
-   状态恢复；
-   页面展示；
-   失败重试；
-   调度；

不应该简单完整地发送给 LLM。

------------------------------------------------------------------------

## 23. Context Builder

Agent LLM 不应直接读取数据库所有历史。

建议建立：

``` text
Context Builder
```

结构：

``` text
Messages
   │
Artifacts
   │
Run State
   │
User Selection
   │
   ▼
Context Builder
   │
   ▼
LLM Context
```

例如实际送给 Agent 的上下文可以是：

``` text
最近有效消息

当前用户选中的图片：
artifact_12

该图片：
1024 × 1024
由 step_04 生成
父图片 artifact_03

用户当前请求：
“把背景换成森林”
```

而不是将完整 AgentSession、所有历史 Step 和所有 Tool Call 全量写入
Prompt。

------------------------------------------------------------------------

## 24. GenerationTask 与 AgentRun

AgentRun 与 GenerationTask 必须分离。

GenerationTask 表示：

> 一次具体图像模型生成任务。

AgentRun 表示：

> 为完成一次用户创作目标而进行的一轮 Agent 执行。

二者关系可以是：

``` text
AgentRun
   │
   ├── AgentStep
   │      │
   │      └── GenerationTask A
   │
   ├── AgentStep
   │      │
   │      └── GenerationTask B
   │
   └── AgentStep
          │
          └── GenerationTask C
```

因此一个 AgentRun 可以对应：

``` text
0 个
1 个
N 个
```

GenerationTask。

不建议通过给现有 GenerationTask 增加大量 Agent 字段来替代 AgentRun。

------------------------------------------------------------------------

## 25. 与现有图片资产体系的关系

现有生成图片仍作为唯一图片资产来源。

结构建议：

``` text
AgentSession
      │
      ▼
AgentRun
      │
      ▼
AgentStep
      │
      ▼
GenerationTask
      │
      ▼
generation_images
      │
      ▼
用户资产
```

Agent 模式产生的图片仍然进入现有：

``` text
generation_images
```

并继续复用：

-   私有 OSS；
-   图片 DTO；
-   资产浏览；
-   删除；
-   收藏；
-   发布；
-   社区；
-   搜索；
-   CDN / 签名 URL；

等已有体系。

------------------------------------------------------------------------

## 26. 普通模式与 Agent 模式最终关系

推荐最终产品结构：

``` text
                AiVista Generate
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
         普通模式               Agent 模式
            │                     │
            ▼                     ▼
       人工选择操作            Creative Goal
            │                     │
            │                     ▼
            │                  AgentRun
            │                     │
            │             Plan / Skill / Tool
            │                     │
            └──────────┬──────────┘
                       ▼
              Image Capability Layer
                       │
                       ▼
                GenerationTask
                       │
                       ▼
                generation_images
                       │
                       ▼
                    用户资产
```

------------------------------------------------------------------------

## 27. V1 推荐技术路线

第一阶段建议采用：

``` text
Single Agent Orchestrator
        +
Planner-Executor
        +
Skill-based Routing
        +
Tool Calling
        +
DAG / State Machine
        +
Controlled Replan
        +
Artifact Context
```

暂不采用 Multi-Agent。

原因：

Multi-Agent 会明显增加：

-   Token 消耗；
-   调用延迟；
-   状态复杂度；
-   Debug 难度；
-   Agent 间通信；
-   失败场景；
-   成本不可控性。

现阶段一个 Orchestrator 已足以完成图像 Agent V1。

------------------------------------------------------------------------

## 28. V1 完整执行示例

用户上传一张鞋子图片并输入：

``` text
参考这双鞋，帮我做三张不同风格的产品宣传图。
```

### 26.1 Intent Resolution

系统判断：

``` text
Complex Goal
```

进入 Planner。

------------------------------------------------------------------------

### 26.2 Planner

生成：

``` text
Goal:
create_product_visuals

Step 1:
analyze_image
source = upload_001

Step 2:
generate_from_image
style = minimal studio

Step 3:
generate_from_image
style = urban street

Step 4:
generate_from_image
style = futuristic technology
```

------------------------------------------------------------------------

### 26.3 Executor

执行：

``` text
step_1
RUNNING
↓
SUCCEEDED

step_2 / step_3 / step_4
在 step_1 成功后同时满足依赖条件
↓
可并行 RUNNING
↓
分别创建 GenerationTask
↓
分别进入 SUCCEEDED / FAILED

独立分支失败不阻塞其他分支；
若部分成功，则 AgentRun 可进入 PARTIALLY_COMPLETED。
```

------------------------------------------------------------------------

### 26.4 Artifact

产生：

``` text
artifact_01
artifact_02
artifact_03
```

分别指向现有：

``` text
generation_images
```

------------------------------------------------------------------------

### 26.5 用户继续修改

用户输入：

``` text
第二张不错，把背景换成夜晚。
```

Context Builder 解析：

``` text
“第二张”
=
artifact_02
```

该请求属于 Simple Action。

直接：

``` text
edit_image(artifact_02)
```

生成：

``` text
artifact_04
```

关系：

``` text
artifact_02
└── artifact_04
```

并创建新的 AgentRun。

------------------------------------------------------------------------

## 29. 第一阶段仍需继续确认的问题

本轮已经确认：

-   Step 支持基于 `dependsOn` 的 DAG 并行；
-   后续 Step 使用 `StepOutputRef / ArtifactRef` 引用前序图片；
-   Step 失败按依赖传播，独立分支继续，允许 Partial Success；
-   Planner 可以通过受控 Replan 动态调整未来 Step；
-   AgentRun 必须受 Execution Budget 限制；
-   用户执行期间不能发送新创作指令，只能 Cancel；
-   Plan 采用 Initial Plan + Controlled Replan，而不是逐 Step ReAct。

后续仍需继续确认以下内容。

### 29.1 AgentPlan 领域模型

-   AgentPlan Schema；
-   AgentStep Schema；
-   `dependsOn` 表达方式；
-   Step Input / Output Schema；
-   `StepOutputRef / ArtifactRef` 统一模型；
-   Plan Version 数据结构；
-   Replan 后旧 Plan 与新 Plan 的关联方式。

### 29.2 Executor

-   DAG 调度实现方式；
-   最大并行数；
-   GenerationTask 与 Step 的状态同步；
-   Tool 超时与 Retry；
-   Partial Success 的最终判定；
-   Cancel 与底层 GenerationTask 的具体衔接；
-   应用重启后的状态恢复。

### 29.3 Replan

-   精确的 Replan Trigger；
-   哪些 Tool 输出允许触发 Replan；
-   Replan 是否重新调用完整 Planner；
-   Replan 时如何携带已完成 Artifact；
-   Replan 失败后的结束策略；
-   `maxReplans` 默认值。

### 29.4 Agent Context

-   Artifact 引用方式；
-   用户选中图片如何进入 Context；
-   "第一张 / 第二张 / 刚才那张"等解析；
-   历史 Context 截断；
-   Context Builder；
-   VLM 分析结果缓存。

### 29.5 Skill

-   Skill Schema；
-   Skill Registry；
-   Skill Prompt；
-   Skill Workflow；
-   Skill Version；
-   Planner 如何选择 Skill；
-   Skill 与动态 Plan 的边界；
-   Skill 内部是否允许 Replan。

### 29.6 产品交互

-   是否向用户展示 Plan；
-   Plan 展示粒度；
-   Replan 是否对用户可见；
-   多图并行执行进度如何展示；
-   Agent Thought 是否展示；
-   Artifact 版本树是否可视化；
-   Cancel 后已成功图片如何在会话中呈现。

------------------------------------------------------------------------

## 30. 当前核心执行决策

  ----------------------------------------------------------------------------------
  问题                                V1 决策
  ----------------------------------- ----------------------------------------------
  Step 是否允许并行                   允许。使用 `dependsOn` 构建 DAG，无依赖 Step
                                      可并行

  后续 Step 如何引用前序 Image        使用 `StepOutputRef / ArtifactRef`，由
                                      Executor 解析真实资源

  Step 失败怎么办                     按依赖传播；独立分支继续；允许
                                      `PARTIALLY_COMPLETED`

  Planner 能否动态增加 Step           可以，但只能通过受控 Replan 调整未来 Step

  一次计划最大允许多少次生成          由 `ExecutionBudget` 强制限制

  用户中途发送新消息怎么办            不允许修改当前 Run；执行期间只允许 Cancel

  Plan 是完整还是动态                 Initial Plan + Controlled Replan，不采用逐
                                      Step ReAct

  Replan 由谁触发                     Agent/系统执行条件触发，用户消息不能触发

  已完成 Step 能否被 Replan 修改      不能；历史执行事实不可篡改

  Cancel 是否回滚已完成结果           不回滚；当前倾向保留已经成功持久化的图片资产
  ----------------------------------------------------------------------------------

------------------------------------------------------------------------

## 31. 当前阶段结论

AiVista Image Agent 不应被设计成：

``` text
LLM
  ↓
优化 Prompt
  ↓
调用一次文生图
```

而应该设计成：

``` text
Creative Goal
     ↓
Orchestrator
     ↓
Intent Resolution
     ↓
Planner / Skill
     ↓
Structured Plan
     ↓
Executor
     ↓
State Machine
     ↓
Tools
     ↓
Image Capability
     ↓
Image Model
     ↓
Artifacts
```

最终推荐架构为：

> Planner-Executor + Skill-based Agent + DAG/State-machine Execution +
> Controlled Replan

同时坚持以下边界：

1.  文生图、图生图、图像编辑属于统一图像能力层；
2.  普通模式和 Agent 模式共享底层能力；
3.  Agent 负责创作编排，不重新建设图像资产体系；
4.  Tool 是原子能力，Skill 是工作流，Agent 是决策者；
5.  AgentRun 与 GenerationTask 分离；
6.  AgentSession 与 AgentRun 分离，一个 User Turn 对应一个独立
    AgentRun；
7.  Image Asset 与 Agent Artifact 分离；
8.  V1 使用 Single Agent，而不是 Multi-Agent；
9.  Step 使用显式依赖构成 DAG，无依赖分支允许并行；
10. Step 之间通过 `StepOutputRef / ArtifactRef` 引用结果，不传递 OSS
    URL；
11. Step 失败按依赖关系传播，独立分支继续，允许 `PARTIALLY_COMPLETED`；
12. V1 支持 Agent 自主的 Controlled Replan，但不做逐 Step ReAct；
13. Replan 只能调整未来未执行计划，已经发生的执行事实不可篡改；
14. 用户执行期间不能通过新消息修改当前 Plan，只允许 Cancel；
15. AgentRun 受到 Execution Budget 强制约束；
16. 后续再逐步增加自动 Critic、Reflection 和更强 Autonomous 能力。
