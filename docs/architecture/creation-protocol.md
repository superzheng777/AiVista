# 创作通信协议

浏览器只访问 Java `/api`；Java 转发受保护的 TS `/internal` 接口。除 DELETE 成功返回 204 无正文外，外部响应统一为 `{code,message,data}`，成功 code 为 0。ID 均为十进制字符串，时间为 ISO 8601 UTC。

## REST 资源

| 方法与路径（省略 /api） | 请求 | 成功响应 data |
| --- | --- | --- |
| GET /generation-sessions | 无分页参数 | SessionSummary[]，当前用户未删除的全部会话 |
| GET /generation-sessions/{sessionId} | 无 | SessionDetail，完整 turns |
| PATCH /generation-sessions/{sessionId} | `{title}` | `{sessionId,title}` |
| DELETE /generation-sessions/{sessionId} | 无正文 | 204 No Content，重复删除本人已删除的会话也返回 204 |
| POST /creations | CreationRequest | 202，`{sessionId,turn}`；Location 指向 creation |
| GET /creations/{creationId} | 无 | CreationTurn |
| PUT /creations/{creationId}/forms/{toolCallId}/response | `{expectedRevision,action,values?}` | 首次 201，重复同值 200；`{changed,creationId,status,revision,item}` |
| PUT /creations/{creationId}/cancellation | `{}` | `{creationId,status,revision}` |

POST 不按 requestId 去重：不同提交是不同创作。前端控制提交按钮，服务端检查同一会话活动执行和 30 轮限制。PUT 表单通过执行版本、toolCallId 和持久化字段值保证幂等。toolCallId 是不透明字符串，路径中必须 URL 编码。

DELETE 仅将 `generation_sessions.deleted_at` 设为删除时间。删除后，列表不再返回该会话，详情、改名、继续创作以及所属创作的查询、表单回答和取消接口均返回 404（code=40401）。他人的会话与不存在的会话同样返回 404；本人重复 DELETE 保持原删除时间并返回 204。未登录返回 401。

会话内任一创作或图片任务处于 QUEUED、RUNNING、WAITING_INPUT，或本地创作仍在退出时，DELETE 返回 409（code=40908），不会自动取消任务。用户需先取消创作；已经发给图片模型的任务须完成保存和结算后才能删除。删除、继续创作和改名以目标会话的 `SELECT ... FOR UPDATE` 串行化，不再预先对用户行加排他锁。新会话先普通查询确认用户存在，再插入并锁定会话；已有会话先锁会话，再检查活动执行和轮次限制。外键检查仍可能取得用户共享锁，不能把移除显式预锁理解成完全没有用户锁。

逻辑删除保留原生 Pi JSONL、执行记录、生成图片、已发布作品和额度记录，不删除 OSS 对象、不退还已经消耗的额度。Java 丢弃已删除会话的迟到创作事件。前端侧栏“…”菜单的删除按钮直接处理 204，不解析 JSON 正文；成功后取消该会话详情及列表的在途查询，移除列表项和详情缓存，清除事件缓冲及状态提示并忽略迟到事件。删除当前会话时替换路由为 `/generate`，删除其他会话不切换页面；失败保留会话并显示服务端原因或网络失败提示。

```json
{
  "sessionId": "1001",
  "mode": "AGENT",
  "input": { "prompt": "设计咖啡店海报", "assetIds": ["3001"] },
  "settings": { "aspectRatio": "3:4", "imageCount": 1 }
}
```

省略 sessionId 创建会话。NORMAL 必须给画幅和 1–6 张数量，还可设置 negativePrompt、promptExtend；AGENT 省略画幅或数量表示自动，不发送 AUTO 或 0。

## 会话响应

SessionSummary：sessionId、title、creationCount、lastMessageAt。SessionDetail 再包含 schemaVersion=1、creationLimit=30、turns。

```json
{
  "schemaVersion": 1,
  "sessionId": "1001",
  "title": "咖啡店海报",
  "creationCount": 1,
  "creationLimit": 30,
  "lastMessageAt": "2026-10-07T00:00:00Z",
  "turns": [{
    "creationId": "2001", "mode": "AGENT", "status": "WAITING_INPUT", "revision": 2,
    "input": { "prompt": "设计咖啡店海报", "assets": [] },
    "settings": { "aspectRatio": "3:4", "imageCount": 1 },
    "createdAt": "2026-10-07T00:00:00Z", "completedAt": null, "failureCode": null,
    "items": [{
      "id": "form-call-1", "kind": "form", "toolCallId": "form-call-1", "status": "PENDING",
      "schemaVersion": 2, "title": "确认标题",
      "fields": [{ "id": "headline", "type": "TEXT", "label": "海报标题", "required": true, "value": "" }]
    }]
  }]
}
```

普通与 Agent 的 generation 内容项由原生 toolResult.details 和 MySQL 图片执行记录共同组装，id 使用对应 toolCallId。数据库中的排队状态、执行状态和已结算资产合入同一条目，即使 Pi 尚未追加工具结果也能展示。WebSocket 使用同一 id 和字段更新卡片；历史加载不增加第二张结果卡片。

items 的四种类型：

- text：id、kind、assistantMessageId、text、phase（process/final）。稳定 ID 为 `text:{message.timestamp}:{contentIndex}`，同一文本从过程提升为最终回复时复用 ID。
- tool：id、kind、assistantMessageId、toolCallId、name、status（RUNNING/SUCCEEDED/FAILED/CANCELLED），读取 Skill 时额外提供 skillName（仅技能目录名，用于前端中文标题）。ID 为 `tool:{toolCallId}`，与 form/generation 卡片的 ID 分开。所有工具的历史响应和 WebSocket 均不传 arguments、result、完整文件路径或其他执行详情；原始参数和结果保留在 Pi 会话内供模型使用。工具条目只展示图标、名称及合并计数，不显示右侧状态，不可展开；status 仍用于缓存合并和计数。
- form：id、kind、toolCallId、status（PENDING/SUBMITTED/SKIPPED/CANCELLED）、schemaVersion=2、title、fields。字段为 TEXT 或 SINGLE_SELECT；选项规则沿用工具表单定义。
- generation：id、kind、generationId（执行前可为 null）、status、assets。

Agent 助手区域固定按四部分排列：可折叠的 创作过程（process 文本与 tool）、表单操作、最终回复（final 文本）、图片展示（generation）。已填写、跳过、取消的表单各自折叠，展开显示字段值或操作说明；待填写表单保持可操作。普通生成仅显示真实生成状态和图片，不构造 Agent 回复。

text 与 tool 的 assistantMessageId 为 `assistant:{message.timestamp}`，用于把同一条模型回复的文字和工具关联为一个展示步骤；实时文字增量、工具终态和原生历史投影保持同一标识。该字段由原生消息派生，不回写或迁移历史 JSONL；前端兼容缺少该字段的旧缓存，缺失时逐项展示，不凭相邻顺序推测归属。表单和图片继续在各自区域显示。

工具项仍按每次调用独立返回，失败后的新调用使用新的 toolCallId，不增加重试关联协议。前端仅在渲染过程区时，将同一创作内连续同类的 text_to_image、image_to_image 或 inspect_image 合并为一行；过程文字、表单、final 文本及其他工具中断分组，generation 图片项不打断分组。read 与 request_user_input 不合并。多次调用显示“成功调用数/已发起调用总数”，单次保持原有标题；分母随新调用增加，表示调用次数而非图片数或预先计划的数量。工具行不单独显示执行中、成功、失败、取消状态；所有调用仍保留并参与分母统计，成功数仅统计 SUCCEEDED，后续成功不覆盖先前失败。原始工具项和结果不因展示合并而删除，实时缓存与历史快照使用同一渲染规则。

投影仅在创作成功或部分成功、最后一条原生 assistant 消息以 stop 结束且没有 toolCall 时，将该消息的文本归为 final。此前每次模型调用的公开文字都保留为 process；表单等待、失败和取消不把中途文字当最终回复。模型 thinking 块、图片二进制、压缩摘要不进入展示 DTO。历史投影与实时事件共享 message-items 转换，工具内部结果不由浏览器重新解释。

工具状态同时检查原生 isError 和结构化业务结果：inspect_image 的 details.outcome=FAILED、生图的 details.status=FAILED 都映射为工具失败，不能因 isError=false 被显示为成功。生图部分交付时 tool 仍为 SUCCEEDED，generation 卡片保留 PARTIALLY_SUCCEEDED；取消状态由执行与会话投影处理。

状态统一为 QUEUED、RUNNING、WAITING_INPUT、SUCCEEDED、PARTIALLY_SUCCEEDED、FAILED、CANCELLED。图片引用内部为 `{assetId,url}`；外部展示为 `{assetId,url,expiresAt}`，不可用时前端可将 url 置 null。签名仅是展示数据，不回写 JSONL。

表单示例：`{"expectedRevision":2,"action":"SUBMITTED","values":{"headline":"把日子慢下来"}}`；跳过使用 `action=SKIPPED`。不接受浏览器改写字段标题、类型、选项或必填规则。

## WebSocket 实时协议

浏览器每个已登录标签页建立一条同源 `WS /api/ws/events`，多个会话的创作、审核和互动通知共用；匿名不连接。开发环境由 Next rewrite 完成 Upgrade 转发，手机通过局域网访问时仍使用页面同源地址。Java 校验允许的 Origin；首帧为 `{"type":"authenticate","accessToken":"…"}`，Token 不放 URL。5 秒内未认证关闭，认证同时检查当前用户协议。认证成功返回 `user.ready`；Token 过期以 4001 关闭，前端通过已有 HTTP 单飞刷新后重新连接。

Java 每 15 秒发送 `ping`，浏览器回复 `pong`，45 秒无有效响应判定断线。重连采用 1/2/4/8/15 秒指数退避并加随机抖动，成功后复位。退出、换号和卸载会关闭旧连接并清除回调；连接状态和刷新信号由 Zustand 保存，完整会话仍归 QueryClient。创建、取消和表单提交不等待 WS 就绪，也不会因重连自动重放业务请求。

创作事件均包含 sessionId、creationId、streamId、sequence；内部事件另有 userId，Java 仅向该用户广播。sequence 由 TS RuntimeEventService 在每次公开创作事件发布时递增，不是 Pi 提供的字段；同一创作的 streamId 内独立排序。游标只在 TS 内存中保留，释放或进程重启后生成新的 streamId，不写入 Pi JSONL。

- `creation.text.delta`：`{sessionId,creationId,streamId,sequence,itemId,assistantMessageId,delta,offset}`。直接转发 Pi 每个公开 `text_delta`，不做 100ms 合并；offset 是该文本项中 UTF-16 字符偏移，前端只追加尚未覆盖的部分。
- `creation.item.upserted`：同样的路由与游标字段，加完整 `item`；用于工具、表单、图片及文字结束时的全文校正。text_end/message_end 使用原文本项 ID，最终回复分类仍以历史投影为准。
- `creation.updated`：同样的路由与游标字段，加 status、revision。
- `creation.snapshot`：同样的路由与游标字段，加完整 `turn`。用于首次订阅、重连及缺口修复，不逐条重放旧事件。
- `publication.updated`、`interaction.notification.created` 保留原社区载荷与 eventId，触发相应 REST 缓存失效，不承载完整消息列表。

浏览器通过 `{"type":"sync","creationIds":["2001"]}` 请求快照。Java 校验归属后订阅内部用户通道；内部重连也自动查询该用户未结束创作。TS 在读取前后核对游标，期间有事件则重新读取，使快照与其 sequence 对齐。快照来自 Pi 已持久化分支 + SQL 状态/图片结果 + Pi SDK 当前未落盘消息及必要临时条目；不维护另一份长期完整创作缓存。SDK 在每条消息完成时追加原生 JSONL，不等整次创作结束。

前端收到重复/旧 sequence 忽略，遇到 streamId 变化、序号缺口或文字 offset 缺口请求新快照；未知创作先通过快照建立会话缓存，再继续增量。快照可先于 POST 响应，创建响应不会覆盖已存在的该轮创作。HTTP 历史的每个 turn 携带 stream:{id,sequence}，与 WS 快照共用读取前后游标校验。前端 loadSessionSnapshot 在发起历史请求前开启临时事件缓冲，以 HTTP 快照为基线，按原顺序补入请求期间收到、且尚未被快照覆盖的事件；同流 sequence 不大于快照的事件忽略，文字仍按 offset 去重。请求结束或失败即释放缓冲，不再按“缓存已有 stream”保留整轮旧内容。普通事件不会逐帧请求历史；连接恢复时还使通知未读数、相关资源和会话摘要失效，以 REST 补齐遗漏的社区变化。这里没有事件持久化队列、ACK 或无限重传承诺。

断线不取消 Agent、不重新执行付费调用。WAITING_INPUT 已落库且本次 Agent Loop 结束，用户可在 WS 中断时通过 HTTP 提交表单并恢复执行。TS 进程中断时沿用 RUNNING 创作失败收口、WAITING_INPUT 保留并可继续的策略，不承诺恢复尚未完成消息的逐 token 内容。

取消/失败关闭等待中的表单与工具展示，但不据此改写图片任务状态；已发出的图片请求继续保存结果与结算。内部用户连接待父创作与相关图片任务均结束后释放，避免遗漏迟到图片。图片按 assetId 去重，所有入口复用原 item.id。

## 内部 HTTP、WebSocket 与 MQ

Java → TS 使用 X-AiVista-Worker-Token 与 X-AiVista-User-Id；浏览器无法指定可信用户头。内部 GET/PATCH/DELETE/POST/PUT 路径在上述资源前加 `/internal`。TS 再次核对执行和会话归属。内部 DELETE 成功返回 200 与 `{sessionId,deleted:true}`，Java 将其转换为外部 204 无正文。

Java 主动连接 TS `WS /internal/events`：每个有未结束创作或图片任务的用户一条连接，复用 `X-AiVista-Worker-Token` 与 `X-AiVista-User-Id` 鉴权。内部使用原生 ping/pong、15 秒心跳和带抖动的指数重连；发送 sync 后接收快照及增量。Java 只校验路由、为结构化图片补签名并转发，不累计文字。HTTP 回调端点已移除。两端为单实例；不引入 Redis、跨实例路由或新的图片 MQ。

创作持久化和表单回答后由 TS 本地调度器直接执行，启动及周期扫描 QUEUED 创作兜底，不发送创作 MQ。Java 受理仍依赖 TS 内部 HTTP 在线。

MQ 仅承载图片生成：`aivista.generation.execute.v1` 为 durable quorum，消息为 `{generationId,expectedRevision}`，ID 为十进制字符串。TS 扫描尚未派发的 QUEUED GENERATION 记录，收到发布确认后写 dispatched_at。完整模型参数和授权图片引用保存在 MySQL，不放入消息。

每个部署只运行一个异步图片消费者，`AIVISTA_GENERATION_PREFETCH=200`；普通生成与 Agent 生图工具共用此队列。图片任务通过状态和 revision CAS 领取，模型请求实际发出前平滑限速，默认最多 2 次/秒，不设置第二层模型并发数。等待限速、模型执行、转存及结算全部占用这 200 个未 ACK 名额。消费者不等待上一张图片完成才启动下一次请求；每条图片结果可靠保存后单独 ACK。

重复或过期消息不重复调用模型；已保存的模型响应可用于继续转存和结算。模型请求可能已发出但结果不确定时，写入明确失败原因并收口，不因消息重投而重新付费调用。未发出请求的任务取消后不调用模型，已发出的任务继续保存结果和结算。工具通过数据库终态恢复结果，内存通知和定期查询只负责唤醒。

生成结果、额度和资产由 TS 在同一事务中收口；没有跨服务 completion 请求或 Worker Ledger。

## 2026-10-20 实时链路验收

当前验收范围为单 Java、单 TS 的开发环境。浏览器每已登录标签页一条原生 WS，Java↔TS 每活动用户一条；HTTP 保留创建、取消、表单和查询。

| 自动化验证 | 结果与范围 |
| --- | --- |
| Java `mvnw clean test` | 146 项；首帧鉴权、用户协议、隔离与连接上限，Node HTTP/1.1 兼容，父终态前不释放图片路由，删除会话解除路由并拒绝迟到消息 |
| TS `AIVISTA_NATIVE_SCHEMA_TEST=true pnpm test` | 163 项，含 36 项专属临时数据库集成、18 项 Agent 运行器测试；另通过 typecheck/build |
| 前端 `pnpm test` / `pnpm test:architecture` | 193 项回归与 14 项架构检查；另通过 typecheck/lint/format:check/build |
| 快照边界 | 读取期间事件变化时重读；HTTP/WS 共用游标，覆盖快照不含/已含部分/已含全部增量、首次 HTTP 基线、请求失败释放缓冲、签名续期和已挂载查询的迟到响应 |
| 运行器精简 | 直接消费 Pi 原生事件，公开项、增量、快照通知与 observer 各有实际消费者；测试验证工具执行、原生结果、表单等待和预算，不维护改名事件协议 |

真实 API/WS 联调经过 Next 同源 Upgrade：普通与 Agent 生图成功并收到最终成功事件，两张图片 GET Range 均返回 206；并行表单等待、浏览器重连、内部 WS 中断恢复、断线期间 HTTP 跳过续执行及独立取消通过。更新后的 HTTP 历史与 WS sync 已验证同一轮游标一致。Chrome 隔离浏览器通过实际输入器发起文本创作，收到 77 个增量并观察到文字逐步增长，最终完成，提交后整页重载次数为 0。这些结果不代表已完成压力、多实例、生产代理或真机验收。

HTTP 请求期缓冲只位于 queryFn 的 loadSessionSnapshot，Query 使用默认 structuralSharing；已挂载查询的 WS 写入不会被历史规则拦截。原有通用历史合并、累计全文回退、未消费的同步完成帧、旧回调配置、事件代理路由和文本分帧实现均已清理。仅在文字结束或原生消息完成时推送完整文字项，逐 chunk 内容只走 onDelta。

Pi 沿用原生消息追加：新会话可能在第一条 assistant 完成时才首次刷盘，之后逐消息追加，未完成 token 不保证跨进程恢复。生产环境与重要数据的操作限制、资产保留和付费执行语义保持原约束。

文档核对涵盖项目自有 Markdown、配置样例及 Git 忽略的面试资料；普通文档、源码目录树、当前配置和相对链接同步检查。一次性迁移核对脚本、快照及联调输出已清理，保留正式测试和当前服务日志。面试资料沿用既有 Git 忽略规则。
